'use client';

/**
 * Arcade Panel Component
 * Container with hard edges, 3px borders per styleguide
 */

import { HTMLAttributes, forwardRef } from 'react';

type PanelVariant = 'default' | 'dark' | 'highlight';

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: PanelVariant;
  noPadding?: boolean;
}

const variantStyles: Record<PanelVariant, string> = {
  default: 'bg-scale-blue border-scale-blue-light',
  dark: 'bg-scale-blue-dark border-scale-blue',
  highlight: 'bg-scale-blue border-venom-orange',
};

export const Panel = forwardRef<HTMLDivElement, PanelProps>(
  (
    {
      variant = 'default',
      noPadding = false,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={`
          rounded-arcade border-[3px]
          ${variantStyles[variant]}
          ${noPadding ? '' : 'p-4 sm:p-6'}
          ${className}
        `}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Panel.displayName = 'Panel';

export default Panel;
