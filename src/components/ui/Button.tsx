'use client';

/**
 * Arcade Button Component
 * Follows OG Snake styleguide: hard edges, 3px borders, button hierarchy
 */

import { ButtonHTMLAttributes, forwardRef } from 'react';

type ButtonVariant = 'go' | 'stop' | 'neutral' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  // Orange fill - for Play/Upgrade/Confirm actions
  go: 'bg-venom-orange text-scale-blue-dark border-venom-orange-dark hover:bg-venom-orange-light',
  // Red fill - for Quit/Delete/Cancel actions
  stop: 'bg-strike-red text-bone-white border-red-900 hover:bg-red-600',
  // Blue fill with light border - for Settings/Neutral actions
  neutral: 'bg-scale-blue text-bone-white border-scale-blue-light hover:bg-scale-blue-light',
  // Transparent with border - for secondary actions
  ghost: 'bg-transparent text-bone-white border-scale-blue-light hover:bg-scale-blue/50',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-6 py-3 text-base',
  lg: 'px-8 py-4 text-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'neutral',
      size = 'md',
      fullWidth = false,
      className = '',
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={`
          font-display uppercase tracking-arcade
          rounded-arcade border-[3px]
          transition-all duration-100 ease-out
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${fullWidth ? 'w-full' : ''}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.02] active:scale-[0.98]'}
          ${className}
        `}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
