interface FormMessageProps {
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

export function FormMessage({ type, message }: FormMessageProps) {
  const colors = {
    success: 'text-success-text bg-success-light border-success/20',
    error: 'text-error-text bg-error-light border-error/20',
    info: 'text-information-text bg-information-light border-information/20',
    warning: 'text-warning-text bg-warning-light border-warning/20',
  };

  return <div className={`rounded-[var(--radius-md)] border px-4 py-3 text-sm ${colors[type]}`}>{message}</div>;
}
