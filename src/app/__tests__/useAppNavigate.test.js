import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppNavigate } from '../useAppNavigate';
import { ROLES } from '../../constants/roles';
import { STUDENT_ROUTE_IDS } from '../routes/studentRoutes';

// These run against jsdom's REAL window.history — pushState/replaceState are
// synchronous, but back()/forward() resolve asynchronously (a real popstate
// on a later tick), exactly like real browsers. That asynchrony is exactly
// what made the original bug (selecting a search result, then landing back
// on the starting page) possible, so exercising the real API here — not a
// synchronous mock — is what would have caught it.
describe('useAppNavigate', () => {
  it('normal navigation pushes a new history entry', () => {
    window.history.pushState({}, '', '/student/dashboard');
    const { result } = renderHook(() => useAppNavigate(ROLES.STUDENT, () => {}));
    const lengthBefore = window.history.length;

    act(() => {
      result.current(STUDENT_ROUTE_IDS.PLANNER);
    });

    expect(window.location.pathname).toBe('/student/planner');
    expect(window.history.length).toBe(lengthBefore + 1);
  });

  it('{ replace: true } swaps the current entry instead of pushing a new one', () => {
    window.history.pushState({}, '', '/student/dashboard');
    const { result } = renderHook(() => useAppNavigate(ROLES.STUDENT, () => {}));
    const lengthBefore = window.history.length;

    act(() => {
      result.current(STUDENT_ROUTE_IDS.PLANNER, { replace: true });
    });

    expect(window.location.pathname).toBe('/student/planner');
    expect(window.history.length).toBe(lengthBefore);
  });

  it('calls setPathname with the resolved path for both push and replace', () => {
    window.history.pushState({}, '', '/student/dashboard');
    let lastPathname = null;
    const { result } = renderHook(() => useAppNavigate(ROLES.STUDENT, (p) => { lastPathname = p; }));

    act(() => { result.current(STUDENT_ROUTE_IDS.PLANNER, { replace: true }); });
    expect(lastPathname).toBe('/student/planner');

    act(() => { result.current(STUDENT_ROUTE_IDS.HUB); });
    expect(lastPathname).toBe('/student/learning-hub');
  });

  it('a replace onto the page\'s own pushed entry means one real Back lands on the page before it', async () => {
    // Mirrors the mobile search panel's own sequence: the "original" page is
    // already on the stack, then the panel pushes its own dummy entry (same
    // path) before the student picks a result.
    window.history.pushState({}, '', '/student/dashboard'); // original page
    window.history.pushState({ studentSearchPanel: true }, ''); // panel's own entry
    const { result } = renderHook(() => useAppNavigate(ROLES.STUDENT, () => {}));

    act(() => {
      result.current(STUDENT_ROUTE_IDS.PLANNER, { replace: true });
    });
    expect(window.location.pathname).toBe('/student/planner');

    const popstate = new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }));
    window.history.back();
    await popstate;

    expect(window.location.pathname).toBe('/student/dashboard');
  });

  it('no-ops when the target resolves to the page already showing (never pushes or replaces a duplicate)', () => {
    window.history.pushState({}, '', '/student/dashboard');
    const { result } = renderHook(() => useAppNavigate(ROLES.STUDENT, () => {}));
    const lengthBefore = window.history.length;

    act(() => {
      result.current(STUDENT_ROUTE_IDS.DASHBOARD);
    });

    expect(window.history.length).toBe(lengthBefore);
    expect(window.location.pathname).toBe('/student/dashboard');
  });
});
