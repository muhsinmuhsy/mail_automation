interface InlineFieldErrorProps {
  message?: string;
}

export function InlineFieldError({ message }: InlineFieldErrorProps) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-error">{message}</p>;
}
