import { useEffect, useMemo, useState } from 'react';
import { ADMIN_ROUTE_ALIASES, ADMIN_ROUTE_IDS, ADMIN_ROUTES, getAdminRouteByPath } from './routes/adminRoutes';
import { AUTH_PATHS } from './routes/authPaths';
import ProtectedRoute from './routes/ProtectedRoute';
import {
  getStudentRouteByPath,
  STUDENT_ROUTE_ALIASES,
  STUDENT_ROUTE_IDS,
  STUDENT_ROUTES,
} from './routes/studentRoutes';
import { ROLES } from '../constants/roles';
import { useAuth } from '../contexts/AuthContext';
import AdminLayout from '../layouts/AdminLayout/AdminLayout';
import StudentLayout from '../layouts/StudentLayout/StudentLayout';
import AdminAuditLogPage from '../pages/admin/AuditLog';
import AdminChatbotRulesPage from '../pages/admin/ChatbotRules';
import AdminChatSessionsPage from '../pages/admin/ChatSessions';
import AdminDashboardPage from '../pages/admin/Dashboard';
import AdminFeedbackPage from '../pages/admin/Feedback';
import AdminKnowledgeBasePage from '../pages/admin/KnowledgeBase';
import AdminResourcesPage from '../pages/admin/Resources';
import AdminSettingsPage from '../pages/admin/Settings';
import AdminUsersPage from '../pages/admin/Users';
import LoginPage from '../pages/auth/Login';
import RegisterPage from '../pages/auth/Register';
import AssistantPage from '../pages/student/AIAssistant';
import AnalyticsPage from '../pages/student/Analytics';
import DashboardPage from '../pages/student/Dashboard';
import FeedbackPage from '../pages/student/Feedback';
import LearningHubPage from '../pages/student/LearningHub';
import NotificationsPage from '../pages/student/Notifications';
import PlannerPage from '../pages/student/Planner';
import ProfilePage from '../pages/student/Profile';
import ResourcesPage from '../pages/student/Resources';

const STUDENT_PAGES = {
  [STUDENT_ROUTE_IDS.DASHBOARD]: DashboardPage,
  [STUDENT_ROUTE_IDS.ASSISTANT]: AssistantPage,
  [STUDENT_ROUTE_IDS.HUB]: LearningHubPage,
  [STUDENT_ROUTE_IDS.RESOURCES]: ResourcesPage,
  [STUDENT_ROUTE_IDS.PLANNER]: PlannerPage,
  [STUDENT_ROUTE_IDS.ANALYTICS]: AnalyticsPage,
  [STUDENT_ROUTE_IDS.PROFILE]: ProfilePage,
  [STUDENT_ROUTE_IDS.NOTIFICATIONS]: NotificationsPage,
  [STUDENT_ROUTE_IDS.FEEDBACK]: FeedbackPage,
};

const ADMIN_PAGES = {
  [ADMIN_ROUTE_IDS.DASHBOARD]: AdminDashboardPage,
  [ADMIN_ROUTE_IDS.USERS]: AdminUsersPage,
  [ADMIN_ROUTE_IDS.KNOWLEDGE_BASE]: AdminKnowledgeBasePage,
  [ADMIN_ROUTE_IDS.RESOURCES]: AdminResourcesPage,
  [ADMIN_ROUTE_IDS.CHATBOT_RULES]: AdminChatbotRulesPage,
  [ADMIN_ROUTE_IDS.CHAT_SESSIONS]: AdminChatSessionsPage,
  [ADMIN_ROUTE_IDS.FEEDBACK]: AdminFeedbackPage,
  [ADMIN_ROUTE_IDS.AUDIT_LOG]: AdminAuditLogPage,
  [ADMIN_ROUTE_IDS.SETTINGS]: AdminSettingsPage,
};

function resolveRoute(pathname, role) {
  if (role === ROLES.ADMIN) {
    return getAdminRouteByPath(pathname) ?? ADMIN_ROUTES[ADMIN_ROUTE_IDS.DASHBOARD];
  }

  return getStudentRouteByPath(pathname) ?? STUDENT_ROUTES[STUDENT_ROUTE_IDS.DASHBOARD];
}

function resolveNavigationTarget(target, role) {
  const ownAliases = role === ROLES.ADMIN ? ADMIN_ROUTE_ALIASES : STUDENT_ROUTE_ALIASES;
  const otherAliases = role === ROLES.ADMIN ? STUDENT_ROUTE_ALIASES : ADMIN_ROUTE_ALIASES;
  const ownRoutes = role === ROLES.ADMIN ? ADMIN_ROUTES : STUDENT_ROUTES;
  const otherRoutes = role === ROLES.ADMIN ? STUDENT_ROUTES : ADMIN_ROUTES;

  const routeId = ownAliases[target] ?? otherAliases[target] ?? target;
  const route = ownRoutes[routeId] ?? otherRoutes[routeId];

  return route?.path ?? target;
}

export default function AppRouter() {
  const { isAuthenticated, isReady, role } = useAuth();
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const handlePop = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  const navigate = (target) => {
    const nextPath = resolveNavigationTarget(target, role);

    if (nextPath !== window.location.pathname) {
      window.history.pushState({}, '', nextPath);
      setPathname(nextPath);
    }
  };

  const route = useMemo(() => resolveRoute(pathname, role), [pathname, role]);

  useEffect(() => {
    if (!isReady) return;

    const isAuthPath = pathname === AUTH_PATHS.LOGIN || pathname === AUTH_PATHS.REGISTER;

    if (!isAuthenticated && !isAuthPath) {
      navigate(AUTH_PATHS.LOGIN);
      return;
    }

    if (isAuthenticated && (pathname === '/' || isAuthPath)) {
      navigate(role === ROLES.ADMIN ? ADMIN_ROUTE_IDS.DASHBOARD : STUDENT_ROUTE_IDS.DASHBOARD);
      return;
    }

    if (isAuthenticated && role === ROLES.ADMIN && pathname.startsWith('/student')) {
      navigate(ADMIN_ROUTE_IDS.DASHBOARD);
      return;
    }

    if (isAuthenticated && role === ROLES.STUDENT && pathname.startsWith('/admin')) {
      navigate(STUDENT_ROUTE_IDS.DASHBOARD);
      return;
    }

    if (isAuthenticated && route.path !== pathname) {
      navigate(route.id);
    }
  }, [isAuthenticated, isReady, pathname, role, route.id, route.path]);

  if (!isReady) return null;

  if (!isAuthenticated) {
    if (pathname === AUTH_PATHS.REGISTER) {
      return <RegisterPage onRegistered={() => navigate(AUTH_PATHS.LOGIN)} onGoToLogin={() => navigate(AUTH_PATHS.LOGIN)} />;
    }

    return (
      <LoginPage
        onAuthenticated={(nextRole) => navigate(nextRole === ROLES.ADMIN ? ADMIN_ROUTE_IDS.DASHBOARD : STUDENT_ROUTE_IDS.DASHBOARD)}
        onGoToRegister={() => navigate(AUTH_PATHS.REGISTER)}
      />
    );
  }

  if (role === ROLES.ADMIN) {
    const Page = ADMIN_PAGES[route.id] ?? AdminDashboardPage;

    return (
      <AdminLayout active={route.id} onNavigate={navigate}>
        <ProtectedRoute route={route} onNavigate={navigate}>
          <Page onNavigate={navigate} />
        </ProtectedRoute>
      </AdminLayout>
    );
  }

  const Page = STUDENT_PAGES[route.id] ?? DashboardPage;

  return (
    <StudentLayout active={route.id} onNavigate={navigate}>
      <ProtectedRoute route={route} onNavigate={navigate}>
        <Page onNavigate={navigate} />
      </ProtectedRoute>
    </StudentLayout>
  );
}
