import React from 'react';

/** ADR-0020 C: deliberately classified primary content. PageSurface remains flat. */
export function PrimaryContentContainer({ children, elevation = 'none', padding = 'responsive', as: Tag = 'section', className = '', ariaLabel }: {
  children: React.ReactNode;
  elevation?: 'none' | 'soft';
  padding?: 'none' | 'responsive';
  as?: 'div' | 'section';
  className?: string;
  ariaLabel?: string;
}) {
  return <Tag data-surface="primary-content" data-elevation={elevation === 'soft' ? 'soft' : undefined}
    aria-label={ariaLabel}
    className={`ui-primary-content ${padding === 'responsive' ? 'p-3 sm:p-5' : ''} ${className}`}>
    {children}
  </Tag>;
}
