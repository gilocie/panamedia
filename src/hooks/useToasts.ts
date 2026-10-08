import { useState, useCallback } from 'react';

export interface Toast { id: string; message: string; }

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, durationMs = 5000) => {
    setToasts(prev => {
      // Prevent duplicate identical toast notifications from showing at the same time
      if (prev.some(t => t.message === message)) {
        return prev;
      }
      const id = 'toast_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      setTimeout(() => {
        setToasts(current => current.filter(t => t.id !== id));
      }, durationMs);
      return [...prev, { id, message }];
    });
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}
