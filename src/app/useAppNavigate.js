import { ADMIN_ROUTE_ALIASES, ADMIN_ROUTES } from './routes/adminRoutes';
import { STUDENT_ROUTE_ALIASES, STUDENT_ROUTES } from './routes/studentRoutes';
import { ROLES } from '../constants/roles';

export function resolveNavigationTarget(target, role) {
  const ownAliases = role === ROLES.ADMIN ? ADMIN_ROUTE_ALIASES : STUDENT_ROUTE_ALIASES;
  const otherAliases = role === ROLES.ADMIN ? STUDENT_ROUTE_ALIASES : ADMIN_ROUTE_ALIASES;
  const ownRoutes = role === ROLES.ADMIN ? ADMIN_ROUTES : STUDENT_ROUTES;
  const otherRoutes = role === ROLES.ADMIN ? STUDENT_ROUTES : ADMIN_ROUTES;

  const routeId = ownAliases[target] ?? otherAliases[target] ?? target;
  const route = ownRoutes[routeId] ?? otherRoutes[routeId];

  return route?.path ?? target;
}

// Builds the app's single `navigate(target, { replace }?)` function — the
// `onNavigate` every page/layout receives. Pulled out of AppRouter into its
// own hook so the push-vs-replace history mechanics are unit-testable
// directly against real window.history, without rendering the whole route
// tree (every page component it would otherwise drag in).
//
// `{ replace: true }` swaps the CURRENT history entry's path instead of
// pushing a new one — used by the student topbar's mobile search panel so
// selecting a result lands on that page without leaving the panel's own
// pushed history entry behind it (see StudentTopbar.navigateTo). Normal
// navigation everywhere else never passes this option.
export function useAppNavigate(role, setPathname) {
  return (target, { replace = false } = {}) => {
    const nextPath = resolveNavigationTarget(target, role);

    if (nextPath !== window.location.pathname) {
      if (replace) {
        window.history.replaceState({}, '', nextPath);
      } else {
        window.history.pushState({}, '', nextPath);
      }
      setPathname(nextPath);
    }
  };
}
