interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'information';
}

const variantStyles: Record<string, string> = {
  default: 'bg-selected text-text-primary',
  success: 'bg-success-light text-success-text',
  warning: 'bg-warning-light text-warning-text',
  error: 'bg-error-light text-error-text',
  information: 'bg-information-light text-information-text',
};

export function Badge({ children, variant = 'default' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variantStyles[variant]}`}>
      {children}
    </span>
  );
}
