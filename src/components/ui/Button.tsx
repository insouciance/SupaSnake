'use client';

/**
 * Arcade Button Component
 * Maps onto the design-system button hierarchy (.btn-go / .btn-stop /
 * .btn-neutral): hard edges, emissive glow, GO / STOP / NEUTRAL.
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
  // Orange emissive fill - for Play/Upgrade/Confirm actions
  go: 'btn-go',
  // Red fill - for Quit/Delete/Cancel actions
  stop: 'btn-stop',
  // Blue fill with light border - for Settings/Neutral actions
  neutral: 'btn-neutral',
  // Transparent with border - for secondary actions
  ghost: 'btn-arcade bg-transparent text-bone-white border-scale-blue-light/70 hover:border-beige/60 hover:bg-scale-blue/40',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-sm min-h-[44px]',
  md: 'px-6 py-3 text-base min-h-[44px]',
  lg: 'px-8 py-4 text-lg min-h-[48px]',
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
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${fullWidth ? 'w-full' : ''}
          ${disabled ? 'opacity-40 cursor-not-allowed pointer-events-none shadow-none' : ''}
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
