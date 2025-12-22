'use client';

/**
 * CommandPanel - Cockpit-style panel container
 * Features optional title bar and corner accent styling
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
        relative bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade
        ${glowOnHover ? 'hover:border-venom-orange hover:shadow-[0_0_12px_rgba(217,131,36,0.3)] transition-all' : ''}
        ${className}
      `}
    >
      {/* Corner accents for viewport effect */}
      {accented && (
        <>
          {/* Top-left corner */}
          <div className="absolute -top-[3px] -left-[3px] w-4 h-4 border-t-[3px] border-l-[3px] border-venom-orange rounded-tl-arcade" />
          {/* Top-right corner */}
          <div className="absolute -top-[3px] -right-[3px] w-4 h-4 border-t-[3px] border-r-[3px] border-venom-orange rounded-tr-arcade" />
          {/* Bottom-left corner */}
          <div className="absolute -bottom-[3px] -left-[3px] w-4 h-4 border-b-[3px] border-l-[3px] border-venom-orange rounded-bl-arcade" />
          {/* Bottom-right corner */}
          <div className="absolute -bottom-[3px] -right-[3px] w-4 h-4 border-b-[3px] border-r-[3px] border-venom-orange rounded-br-arcade" />
        </>
      )}

      {/* Title bar */}
      {title && (
        <div className="px-4 py-2 border-b border-scale-blue-light bg-scale-blue-dark/50">
          <h3 className="text-xs font-display uppercase tracking-arcade text-beige">
            {title}
          </h3>
        </div>
      )}

      {/* Content */}
      <div className={title ? 'p-4' : 'p-4'}>
        {children}
      </div>
    </div>
  );
}

export default CommandPanel;
