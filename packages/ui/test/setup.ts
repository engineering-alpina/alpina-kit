import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * jsdom has no matchMedia and `useIsMobile` calls it on mount, so without this
 * every shell test dies inside an effect with a message that points nowhere near
 * the cause. Reports desktop, which is the branch worth exercising.
 */
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  cleanup();
});
