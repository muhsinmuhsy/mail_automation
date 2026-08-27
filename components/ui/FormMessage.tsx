interface FormMessageProps {
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

export function FormMessage({ type, message }: FormMessageProps) {
  const colors = {
    success: 'text-green-700 bg-green-50 border-green-200',
    error: 'text-red-700 bg-red-50 border-red-200',
    info: 'text-blue-700 bg-blue-50 border-blue-200',
    warning: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  };

  return <div className={`rounded-md border px-4 py-3 text-sm ${colors[type]}`}>{message}</div>;
}
