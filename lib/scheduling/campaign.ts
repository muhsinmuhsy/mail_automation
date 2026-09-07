/** Shared by the preview and persisted jobs. Daily batches are 24 hours apart. */
export function campaignEmailTime(start: Date, index: number, intervalMinutes: number, dailyLimit: number | null): Date {
  if (!Number.isFinite(start.getTime()) || !Number.isInteger(index) || index < 0 || !Number.isInteger(intervalMinutes) || intervalMinutes < 1 || (dailyLimit !== null && (!Number.isInteger(dailyLimit) || dailyLimit < 1))) {
    throw new Error('Choose a valid start time and positive whole numbers for your sending pace.');
  }
  const interval = intervalMinutes * 60_000;
  const batch = dailyLimit === null ? 0 : Math.floor(index / dailyLimit);
  const slot = dailyLimit === null ? index : index % dailyLimit;
  // Long intervals must not cause a later batch to overtake an earlier one.
  const batchDuration = dailyLimit === null ? 0 : Math.max(86_400_000, dailyLimit * interval);
  const result = new Date(start.getTime() + batch * batchDuration + slot * interval);
  result.setUTCSeconds(0, 0);
  if (!Number.isFinite(result.getTime())) throw new Error('This schedule is too far in the future.');
  return result;
}
