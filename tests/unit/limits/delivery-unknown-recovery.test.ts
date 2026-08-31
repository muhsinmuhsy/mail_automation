import { describe, it, expect, beforeEach } from 'vitest';
import { resolveDeliveryUnknown } from '@/lib/limits/email-limit-service';
import { NotFoundError, AppError } from '@/lib/errors';


function makeFakePrisma(seed: {
  jobStatus: string;
  reservationStatus: string;
  usageDate: Date;
}) {
  const todayIso = seed.usageDate.toISOString();
  const store = {
    jobs: new Map<string, any>([
      [
        'j1',
        { id: 'j1', status: seed.jobStatus, user_id: 'u1', campaign_id: 'c1' },
      ],
    ]),
    reservations: new Map<string, any>([
      [
        'r1',
        {
          id: 'r1',
          email_job_id: 'j1',
          attempt_number: 1,
          status: seed.reservationStatus,
          usage_date: seed.usageDate,
          resolved_at: null,
        },
      ],
    ]),
    emailUsageDaily: new Map<string, any>([
      ['u1|' + todayIso, { user_id: 'u1', usage_date: seed.usageDate, sent_count: 0, reserved_count: 1 }],
    ]),
    systemUsageDaily: new Map<string, any>([
      [todayIso, { usage_date: seed.usageDate, sent_count: 0, reserved_count: 1 }],
    ]),
    campaignUsageDaily: new Map<string, any>([
      ['c1|' + todayIso, { campaign_id: 'c1', usage_date: seed.usageDate, sent_count: 0, reserved_count: 1 }],
    ]),
  };

  function applyData(row: any, data: any) {
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object' && 'increment' in v) row[k] = (row[k] ?? 0) + (v.increment as number);
      else if (v && typeof v === 'object' && 'decrement' in v) row[k] = (row[k] ?? 0) - (v.decrement as number);
      else row[k] = v;
    }
    return row;
  }

  const fake: any = {
    $transaction: async (fn: (tx: any) => Promise<any>) => fn(fake),
    emailJob: {
      findUnique: async ({ where }: any) => store.jobs.get(where.id) ?? null,
      update: async ({ where, data }: any) => {
        const row = store.jobs.get(where.id);
        applyData(row, data);
        return row;
      },
    },
    emailSendReservation: {
      findFirst: async ({ where, orderBy }: any) => {
        const rows = [...store.reservations.values()].filter(
          (r) => r.email_job_id === where.email_job_id && where.status.in.includes(r.status)
        );
        if (orderBy?.attempt_number === 'desc') rows.sort((a, b) => b.attempt_number - a.attempt_number);
        return rows[0] ?? null;
      },
      update: async ({ where, data }: any) => {
        const row = store.reservations.get(where.id);
        applyData(row, data);
        return row;
      },
    },
    emailUsageDaily: {
      update: async ({ where, data }: any) => {
        const row = store.emailUsageDaily.get(where.user_id_usage_date.user_id + '|' + where.user_id_usage_date.usage_date.toISOString());
        applyData(row, data);
        return row;
      },
      upsert: async ({ where, update, create }: any) => {
        const key = where.user_id_usage_date.user_id + '|' + where.user_id_usage_date.usage_date.toISOString();
        const row = store.emailUsageDaily.get(key) ?? { ...create };
        applyData(row, update);
        store.emailUsageDaily.set(key, row);
        return row;
      },
    },
    systemUsageDaily: {
      update: async ({ where, data }: any) => {
        const row = store.systemUsageDaily.get(where.usage_date.toISOString());
        applyData(row, data);
        return row;
      },
      upsert: async ({ where, update, create }: any) => {
        const key = where.usage_date.toISOString();
        const row = store.systemUsageDaily.get(key) ?? { ...create };
        applyData(row, update);
        store.systemUsageDaily.set(key, row);
        return row;
      },
    },
    campaignUsageDaily: {
      update: async ({ where, data }: any) => {
        const row = store.campaignUsageDaily.get(where.campaign_id_usage_date.campaign_id + '|' + where.campaign_id_usage_date.usage_date.toISOString());
        applyData(row, data);
        return row;
      },
      upsert: async ({ where, update, create }: any) => {
        const key = where.campaign_id_usage_date.campaign_id + '|' + where.campaign_id_usage_date.usage_date.toISOString();
        const row = store.campaignUsageDaily.get(key) ?? { ...create };
        applyData(row, update);
        store.campaignUsageDaily.set(key, row);
        return row;
      },
    },
  };

  return { fake, store };
}

describe('resolveDeliveryUnknown', () => {
  let usageDate: Date;
  beforeEach(() => {
    usageDate = new Date();
    usageDate.setUTCHours(0, 0, 0, 0);
  });

  it("decision 'sent' commits the reservation and moves counters", async () => {
    const { fake, store } = makeFakePrisma({ jobStatus: 'DELIVERY_UNKNOWN', reservationStatus: 'UNKNOWN', usageDate });

    const result = await resolveDeliveryUnknown(fake, { emailJobId: 'j1', userId: 'u1', campaignId: 'c1', decision: 'sent' });

    expect(result).toBe('sent');
    expect(store.jobs.get('j1').status).toBe('SENT');
    expect(store.reservations.get('r1').status).toBe('COMMITTED');
    const eu = store.emailUsageDaily.get('u1|' + usageDate.toISOString());
    expect(eu.sent_count).toBe(1);
    expect(eu.reserved_count).toBe(0);
    const su = store.systemUsageDaily.get(usageDate.toISOString());
    expect(su.sent_count).toBe(1);
    expect(su.reserved_count).toBe(0);
    const cu = store.campaignUsageDaily.get('c1|' + usageDate.toISOString());
    expect(cu.sent_count).toBe(1);
    expect(cu.reserved_count).toBe(0);
  });

  it("decision 'failed' releases the reservation and only decrements reserved", async () => {
    const { fake, store } = makeFakePrisma({ jobStatus: 'DELIVERY_UNKNOWN', reservationStatus: 'UNKNOWN', usageDate });

    const result = await resolveDeliveryUnknown(fake, { emailJobId: 'j1', userId: 'u1', campaignId: 'c1', decision: 'failed' });

    expect(result).toBe('failed');
    expect(store.jobs.get('j1').status).toBe('FAILED');
    expect(store.reservations.get('r1').status).toBe('RELEASED');
    const eu = store.emailUsageDaily.get('u1|' + usageDate.toISOString());
    expect(eu.sent_count).toBe(0);
    expect(eu.reserved_count).toBe(0);
  });

  it("decision 'unknown' leaves everything unchanged", async () => {
    const { fake, store } = makeFakePrisma({ jobStatus: 'DELIVERY_UNKNOWN', reservationStatus: 'UNKNOWN', usageDate });

    const result = await resolveDeliveryUnknown(fake, { emailJobId: 'j1', userId: 'u1', campaignId: 'c1', decision: 'unknown' });

    expect(result).toBe('unknown');
    expect(store.jobs.get('j1').status).toBe('DELIVERY_UNKNOWN');
    expect(store.reservations.get('r1').status).toBe('UNKNOWN');
    const eu = store.emailUsageDaily.get('u1|' + usageDate.toISOString());
    expect(eu.sent_count).toBe(0);
    expect(eu.reserved_count).toBe(1);
  });

  it('rejects recovery for jobs not in DELIVERY_UNKNOWN', async () => {
    const { fake } = makeFakePrisma({ jobStatus: 'SENT', reservationStatus: 'COMMITTED', usageDate });

    await expect(
      resolveDeliveryUnknown(fake, { emailJobId: 'j1', userId: 'u1', campaignId: 'c1', decision: 'sent' })
    ).rejects.toBeInstanceOf(AppError);
  });

  it('throws NotFoundError when the job is missing', async () => {
    const { fake } = makeFakePrisma({ jobStatus: 'DELIVERY_UNKNOWN', reservationStatus: 'UNKNOWN', usageDate });
    store_delete(fake);

    await expect(
      resolveDeliveryUnknown(fake, { emailJobId: 'missing', userId: 'u1', campaignId: 'c1', decision: 'sent' })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

function store_delete(_fake: any) {
  // The fake's job map is internal; simulate a missing job by overriding findUnique.
  _fake.emailJob.findUnique = async () => null;
}
