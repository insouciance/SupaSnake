'use client';

/**
 * Toast Notification System
 *
 * Provides toast notifications for game events like:
 * - New high scores on leaderboard
 * - Achievement unlocks
 * - Reward claims
 */

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

export type ToastType = 'info' | 'success' | 'error' | 'achievement';

export interface ToastData {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextType {
  toasts: ToastData[];
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const TYPE_STYLES: Record<ToastType, string> = {
  info: 'bg-blue-600',
  success: 'bg-green-600',
  error: 'bg-red-600',
  achievement: 'bg-yellow-600',
};

const TYPE_ICONS: Record<ToastType, string> = {
  info: '\u2139\uFE0F',      // Info icon
  success: '\u2705',         // Check mark
  error: '\u274C',           // X mark
  achievement: '\u{1F3C6}',  // Trophy
};

interface ToastProps {
  id: string;
  message: string;
  type: ToastType;
  onDismiss: (id: string) => void;
}

export function Toast({ id, message, type, onDismiss }: ToastProps) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg ${TYPE_STYLES[type]} text-white animate-slide-in`}
      role="alert"
    >
      <span className="text-xl">{TYPE_ICONS[type]}</span>
      <span className="flex-1 font-medium">{message}</span>
      <button
        onClick={() => onDismiss(id)}
        className="text-white/70 hover:text-white transition-colors"
        aria-label="Dismiss"
      >
        &#x2715;
      </button>
    </div>
  );
}

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 5000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const newToast: ToastData = { id, message, type, duration };

    setToasts(prev => [...prev, newToast]);

    // Auto-dismiss after duration
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map(toast => (
          <Toast
            key={toast.id}
            id={toast.id}
            message={toast.message}
            type={toast.type}
            onDismiss={dismissToast}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export default Toast;
