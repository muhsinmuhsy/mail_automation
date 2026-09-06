/** All persisted start times are instants (UTC); timezone is for user input/display. */
export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
    return timezone.length > 0;
  } catch {
    return false;
  }
}

export function localDateTimeInZone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

/** Reject nonexistent/ambiguous DST times instead of silently scheduling another hour. */
export function zonedDateTimeToIso(value: string, timezone: string): string {
  if (!isValidTimezone(timezone)) throw new Error('Choose a valid IANA timezone, such as Asia/Kolkata.');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Choose a valid start time.');
  const naive = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(naive)) throw new Error('Choose a valid start time.');
  const candidates = new Set<number>();
  for (const hours of [-36, 0, 36]) {
    const sample = naive + hours * 3_600_000;
    const offset = Date.parse(`${localDateTimeInZone(new Date(sample), timezone)}:00Z`) - sample;
    const candidate = naive - offset;
    if (localDateTimeInZone(new Date(candidate), timezone) === value) candidates.add(candidate);
  }
  if (candidates.size !== 1) throw new Error('This time is skipped or repeated by daylight saving. Choose another start time.');
  return new Date([...candidates][0]).toISOString();
}

export function formatScheduledTime(value: string | null | undefined, timezone = 'UTC'): string {
  if (!value || Number.isNaN(Date.parse(value))) return '—';
  const zone = isValidTimezone(timezone) ? timezone : 'UTC';
  return `${new Date(value).toLocaleString(undefined, { timeZone: zone })} (${zone})`;
}
