'use client';

/**
 * Toast Notification System
 *
 * Provides toast notifications for game events like:
 * - New high scores on leaderboard
 * - Run triumphs (portal infusions, splice fusions, codex discoveries)
 * - Identity moments
 *
 * Styled as dynasty-glow panels sliding in over the void.
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import {
  IconBolt,
  IconCheck,
  IconX,
  IconTrophy,
  type IconProps,
} from '@/components/ui/icons';

export type ToastType = 'info' | 'success' | 'error' | 'triumph';

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

/** Per-type glow color (drives the panel-glow border + emissive shadow) */
const TYPE_STYLES: Record<ToastType, string> = {
  info: '[--glow:#00FFFF]',
  success: '[--glow:#4ade80]',
  error: '[--glow:#f43f5e]',
  triumph: '[--glow:#fbbf24]',
};

const TYPE_ICON_COLOR: Record<ToastType, string> = {
  info: 'text-cyber',
  success: 'text-rarity-uncommon',
  error: 'text-strike-red',
  triumph: 'text-rarity-legendary',
};

const TYPE_ICONS: Record<ToastType, (p: IconProps) => React.JSX.Element> = {
  info: IconBolt,
  success: IconCheck,
  error: IconX,
  triumph: IconTrophy,
};

interface ToastProps {
  id: string;
  message: string;
  type: ToastType;
  onDismiss: (id: string) => void;
}

export function Toast({ id, message, type, onDismiss }: ToastProps) {
  const Icon = TYPE_ICONS[type];
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 panel-glow ${TYPE_STYLES[type]} text-bone-white animate-slide-in-right`}
      role="alert"
    >
      <Icon size={20} className={`shrink-0 ${TYPE_ICON_COLOR[type]}`} />
      <span className="flex-1 font-body font-semibold">{message}</span>
      <button
        onClick={() => onDismiss(id)}
        className="p-1 -m-1 text-beige/60 hover:text-bone-white transition-colors"
        aria-label="Dismiss"
      >
        <IconX size={16} />
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
      {/* bottom-20 on mobile clears the fixed bottom tab bar */}
      <div className="fixed bottom-20 sm:bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
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
