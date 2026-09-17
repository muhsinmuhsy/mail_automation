interface UsageProgressProps {
  sent: number;
  reserved: number;
  limit: number;
  label?: string;
}

export function UsageProgress({ sent, reserved, limit, label = 'Daily email usage' }: UsageProgressProps) {
  const used = sent + reserved;
  const remaining = Math.max(0, limit - used);
  const percentage = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const isNearLimit = percentage >= 80;
  const isAtLimit = remaining === 0;

  return (
    <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
      <div className="flex items-center justify-between">
        <p className="text-supporting text-text-secondary">{label}</p>
        {isAtLimit ? (
          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-error-light text-error-text">Limit reached</span>
        ) : isNearLimit ? (
          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-warning-light text-warning-text">Near limit</span>
        ) : null}
      </div>
      <p className="mt-2 text-page-title font-semibold text-text-primary">
        {used} <span className="text-text-secondary font-normal">of {limit}</span>
      </p>
      <div className="mt-3 h-2 w-full rounded-full bg-neutral-100" role="progressbar" aria-valuenow={used} aria-valuemin={0} aria-valuemax={limit}>
        <div
          className={`h-2 rounded-full transition-all ${isAtLimit ? 'bg-error' : isNearLimit ? 'bg-warning' : 'bg-information'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="mt-2 text-caption text-text-secondary">
        {remaining} remaining{reserved > 0 ? ` (${reserved} in progress)` : ''}. Resets at midnight UTC.
      </p>
    </div>
  );
}
