import React from 'react';

/**
 * UX-02-3 shared white content surface (addendum §3): page content
 * sits on a flat white surface with modest rounding and a subtle border
 * over the canonical Ocean background (--color-background, #F5F9FA).
 * One container for every migrated page — dialogs,
 * full-screen errors and overlays keep their own presentation and
 * must not be wrapped in this.
 */
export function PageSurface({ children, className = '', containerClassName = 'max-w-[88rem]' }: { children: React.ReactNode; className?: string; containerClassName?: string }) {
  return (
    <div className={`mx-auto w-full ${containerClassName} px-3 py-4 sm:px-5 sm:py-6`}>
      <div
        data-surface="page"
        className={`ui-page-surface rounded-[1.75rem] border border-slate-200/70 bg-white p-4 sm:p-6 ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
