import { useEffect, useState } from 'react';
import { campaignEmailTime } from '@/lib/scheduling/campaign';
import { formatScheduledTime, zonedDateTimeToIso } from '@/lib/scheduling/time';

const PAGE_SIZE = 10;

export function SchedulePreview({ startAt, timezone, intervalMinutes, dailyLimit, count, loading, recipients }: {
  startAt: string; timezone: string; intervalMinutes: string; dailyLimit: string; count: number; loading?: boolean;
  recipients?: { name?: string | null; email?: string }[];
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    const timer = setTimeout(() => setVisibleCount(PAGE_SIZE), 0);
    return () => clearTimeout(timer);
  }, [count]);

  if (loading) {
    return <section aria-label="Your sending plan" className="rounded-[var(--radius-md)] border border-neutral-200 bg-surface p-4">
      <div className="flex items-center gap-2">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-information" aria-hidden="true" />
        <p className="font-medium text-text-secondary">Updating…</p>
      </div>
    </section>;
  }
  let rows: { label: string; time: Date; recipient?: string }[] = [];
  let singleTime: string | null = null;
  const interval = Number(intervalMinutes);
  const limit = dailyLimit.trim() ? Number(dailyLimit) : null;
  const recipientLabel = (i: number): string | undefined => {
    const r = recipients?.[i];
    if (!r) return undefined;
    if (r.name && r.email) return `${r.name} <${r.email}>`;
    return r.email ?? r.name ?? undefined;
  };
  try {
    const start = new Date(zonedDateTimeToIso(startAt, timezone.trim()));
    if (count === 1) { singleTime = formatScheduledTime(start.toISOString(), timezone.trim()); } else {
    campaignEmailTime(start, 0, interval, limit);
    const visibleRows = Math.min(count, visibleCount);
    rows = Array.from({ length: visibleRows }, (_, i) => ({ label: `Email ${i + 1}`, time: campaignEmailTime(start, i, interval, limit), recipient: recipientLabel(i) }));
    if (limit !== null && count > limit && limit >= visibleRows) rows.push({ label: 'Next batch starts', time: campaignEmailTime(start, limit, interval, limit) });
    if (visibleRows < count) rows.push({ label: `Last email (${count})`, time: campaignEmailTime(start, count - 1, interval, limit), recipient: recipientLabel(count - 1) });
    }
  } catch {
    return <p className="text-sm text-text-secondary">{count === 1 ? 'Choose when to send your email to see its scheduled time.' : 'Enter a valid start time and sending pace to see your schedule.'}</p>;
  }
  if (singleTime !== null) {
    const r = recipients?.[0];
    const recipientStr = r ? (r.name && r.email ? `${r.name} <${r.email}>` : r.email ?? r.name) : null;
    return <section aria-label="Your sending plan" className="rounded-[var(--radius-md)] border border-neutral-200 bg-surface p-4">
      <h3 className="font-semibold">Your scheduled email</h3>
      <p className="mt-2 text-sm">1 email will be scheduled for {singleTime}.{recipientStr && <span className="text-text-secondary"> Recipient: {recipientStr}.</span>}</p>
      <p className="mt-2 text-xs text-text-secondary">Account limits or delivery delays may affect the actual sending time.</p>
    </section>;
  }
  const hasMore = visibleCount < count;
  return <section aria-label="Your sending plan" className="rounded-[var(--radius-md)] border border-neutral-200 bg-surface p-4">
    <h3 className="font-semibold">Your sending plan</h3>
    <p className="mt-2 text-sm">Send 1 email every {interval} {interval === 1 ? 'minute' : 'minutes'}{limit === null ? ', with no daily cap for this campaign.' : `, up to ${limit} emails per daily batch.`}</p>
    <p className="mt-1 text-sm text-text-secondary">{count} recipients. {limit !== null ? 'Daily batches start at least 24 hours apart.' : 'Emails continue at your chosen pace.'}</p>
    <dl className="mt-3 space-y-2 text-sm">{rows.map(row => <div key={row.label} className="flex flex-wrap justify-between gap-x-4"><dt>{row.label}{row.recipient && <span className="text-text-secondary"> — {row.recipient}</span>}</dt><dd>{formatScheduledTime(row.time.toISOString(), timezone.trim())}</dd></div>)}</dl>
    {hasMore && <button type="button" onClick={() => setVisibleCount(c => Math.min(c + PAGE_SIZE, count))} className="mt-3 text-sm text-information hover:underline">See more ({count - visibleCount} remaining)</button>}
    <p className="mt-3 text-xs text-text-secondary">These are planned send times. Account limits, retries and delivery delays may make sending take longer.</p>
  </section>;
}
