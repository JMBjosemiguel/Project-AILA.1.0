import { useAuth } from '../../contexts/AuthContext';
import Button from '../../components/common/Button';
import { ROLES } from '../../constants/roles';
import { ADMIN_ROUTE_IDS } from './adminRoutes';
import { STUDENT_ROUTE_IDS } from './studentRoutes';

export default function ProtectedRoute({ route, children, onNavigate }) {
  const { role } = useAuth();

  if (!route?.allowedRoles?.length) return children;
  if (role && route.allowedRoles.includes(role)) return children;

  return (
    <div className="p-5 lg:p-8 max-w-3xl mx-auto animate-fadeUp">
      <div className="bg-white border border-ink-100 rounded-2xl shadow-soft p-6 text-sm text-ink-600 flex flex-col gap-4">
        <div>
          <h2 className="font-display font-bold text-ink-800 text-lg">Unauthorized</h2>
          <p className="text-ink-400 mt-1">Your current role cannot access this page.</p>
        </div>
        <Button
          className="self-start"
          onClick={() => onNavigate(role === ROLES.ADMIN ? ADMIN_ROUTE_IDS.DASHBOARD : STUDENT_ROUTE_IDS.DASHBOARD)}
        >
          Go to dashboard
        </Button>
      </div>
    </div>
  );
}
