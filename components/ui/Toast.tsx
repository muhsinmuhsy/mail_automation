'use client';

import { useState, useEffect } from 'react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'warning' | 'information';
  onClose?: () => void;
}

export function Toast({ message, type = 'information', onClose }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onClose?.();
    }, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  if (!visible) return null;

  const colors: Record<string, string> = {
    success: 'bg-success-light text-success-text border-success/20',
    error: 'bg-error-light text-error-text border-error/20',
    warning: 'bg-warning-light text-warning-text border-warning/20',
    information: 'bg-information-light text-information-text border-information/20',
  };

  return (
    <div className={`fixed bottom-4 right-4 z-50 rounded-[var(--radius-md)] border px-4 py-3 shadow-[var(--shadow-overlay)] ${colors[type]}`}>
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}
