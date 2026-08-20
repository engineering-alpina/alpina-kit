'use client';

import * as React from 'react';

/** Matches Tailwind's `md` breakpoint, which is where the sidebar goes off-canvas. */
export const MOBILE_BREAKPOINT = 768;

/**
 * True below the `md` breakpoint. Returns false on the server and on the first
 * client render, so the desktop sidebar is what hydrates; the effect corrects it.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener('change', onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return !!isMobile;
}
