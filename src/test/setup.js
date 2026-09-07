import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

// jsdom does not implement these layout APIs that components call for UX polish.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = vi.fn();
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}
if (!window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}
