'use client';

/**
 * CommandPanel - Cockpit-style panel container
 * Elevated void surface with optional title bar and corner accent styling.
 */

import { ReactNode } from 'react';

interface CommandPanelProps {
  /** Panel title displayed in header bar */
  title?: string;
  /** Panel content */
  children: ReactNode;
  /** Whether to show corner accents (viewport style) */
  accented?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Glow effect on hover */
  glowOnHover?: boolean;
}

export function CommandPanel({
  title,
  children,
  accented = false,
  className = '',
  glowOnHover = false,
}: CommandPanelProps) {
  return (
    <div
      className={`
        relative panel-elevated
        ${glowOnHover ? 'transition-all hover:border-venom-orange/60 hover:shadow-glow hover:shadow-venom-orange/25' : ''}
        ${className}
      `}
    >
      {/* Corner accents for viewport effect */}
      {accented && (
        <>
          {/* Top-left corner */}
          <div className="absolute -top-px -left-px w-4 h-4 border-t-2 border-l-2 border-venom-orange rounded-tl-arcade" />
          {/* Top-right corner */}
          <div className="absolute -top-px -right-px w-4 h-4 border-t-2 border-r-2 border-venom-orange rounded-tr-arcade" />
          {/* Bottom-left corner */}
          <div className="absolute -bottom-px -left-px w-4 h-4 border-b-2 border-l-2 border-venom-orange rounded-bl-arcade" />
          {/* Bottom-right corner */}
          <div className="absolute -bottom-px -right-px w-4 h-4 border-b-2 border-r-2 border-venom-orange rounded-br-arcade" />
        </>
      )}

      {/* Title bar */}
      {title && (
        <div className="px-4 py-2 border-b border-scale-blue-light/40 bg-void-deep/40 rounded-t-arcade">
          <h3 className="label-arcade">
            {title}
          </h3>
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        {children}
      </div>
    </div>
  );
}

export default CommandPanel;
