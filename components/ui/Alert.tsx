interface AlertProps {
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
  onClose?: () => void;
}

export function Alert({ type, message, onClose }: AlertProps) {
  const colors = {
    info: 'bg-information-light text-information-text border-information/20',
    warning: 'bg-warning-light text-warning-text border-warning/20',
    error: 'bg-error-light text-error-text border-error/20',
    success: 'bg-success-light text-success-text border-success/20',
  };

  return (
    <div className={`flex items-center justify-between rounded-[var(--radius-md)] border px-4 py-3 ${colors[type]}`}>
      <p className="text-sm">{message}</p>
      {onClose && (
        <button onClick={onClose} className="ml-4 text-sm opacity-70 hover:opacity-100">
          Dismiss
        </button>
      )}
    </div>
  );
}
