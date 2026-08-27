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
    success: 'bg-green-50 text-green-800 border-green-200',
    error: 'bg-red-50 text-red-800 border-red-200',
    warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    information: 'bg-blue-50 text-blue-800 border-blue-200',
  };

  return (
    <div className={`fixed bottom-4 right-4 z-50 rounded-md border px-4 py-3 shadow-lg ${colors[type]}`}>
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}
