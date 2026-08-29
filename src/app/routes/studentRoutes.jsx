import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarCheck2,
  FolderOpen,
  LayoutGrid,
  MessageSquareHeart,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { ROLES } from '../../constants/roles';

export const STUDENT_ROUTE_IDS = {
  DASHBOARD: 'student.dashboard',
  ASSISTANT: 'student.assistant',
  HUB: 'student.hub',
  RESOURCES: 'student.resources',
  PLANNER: 'student.planner',
  ANALYTICS: 'student.analytics',
  NOTIFICATIONS: 'student.notifications',
  PROFILE: 'student.profile',
  FEEDBACK: 'student.feedback',
};

export const STUDENT_ROUTES = {
  [STUDENT_ROUTE_IDS.DASHBOARD]: {
    id: STUDENT_ROUTE_IDS.DASHBOARD,
    path: '/student/dashboard',
    label: 'Dashboard',
    title: 'Dashboard',
    subtitle: "Welcome back - here's where you left off.",
    icon: LayoutGrid,
    allowedRoles: [ROLES.STUDENT],
  },
  [STUDENT_ROUTE_IDS.ASSISTANT]: {
    id: STUDENT_ROUTE_IDS.ASSISTANT,
    path: '/student/ai-assistant',
    label: 'AI Assistant',
    title: 'AI Assistant',
    subtitle: 'Ask AILA anything about your coursework.',
    icon: Sparkles,
    badge: 'AI',
    allowedRoles: [ROLES.STUDENT],
  },
  [STUDENT_ROUTE_IDS.HUB]: {
    id: STUDENT_ROUTE_IDS.HUB,
    path: '/student/learning-hub',
    label: 'Learning Hub',
    title: 'Learning Hub',
    subtitle: 'Subjects, modules, topics, and lessons.',
    icon: BookOpen,
    allowedRoles: [ROLES.STUDENT],
  },
  [STUDENT_ROUTE_IDS.RESOURCES]: {
    id: STUDENT_ROUTE_IDS.RESOURCES,
    path: '/student/resources',
    label: 'Resource Library',
    title: 'Resource Library',
    subtitle: 'Every file and link from your courses.',
    icon: FolderOpen,
    allowedRoles: [ROLES.STUDENT],
  },
  [STUDENT_ROUTE_IDS.PLANNER]: {
    id: STUDENT_ROUTE_IDS.PLANNER,
    path: '/student/planner',
    label: 'Study Planner',
    title: 'Study Planner',
    subtitle: 'Tasks, deadlines, and your schedule.',
    icon: CalendarCheck2,
    allowedRoles: [ROLES.STUDENT],
  },
  [STUDENT_ROUTE_IDS.ANALYTICS]: {
    id: STUDENT_ROUTE_IDS.ANALYTICS,
    path: '/student/analytics',
    label: 'Analytics',
    title: 'Learning Analytics',
    subtitle: 'How your study habits are trending.',
    icon: BarChart3,
    allowedRoles: [ROLES.STUDENT],
  },
  [STUDENT_ROUTE_IDS.NOTIFICATIONS]: {
    id: STUDENT_ROUTE_IDS.NOTIFICATIONS,
    path: '/student/notifications',
    label: 'Notifications',
    title: 'Notifications',
    subtitle: 'Reminders and updates in one feed.',
    icon: Bell,
    allowedRoles: [ROLES.STUDENT],
  },
  [STUDENT_ROUTE_IDS.PROFILE]: {
    id: STUDENT_ROUTE_IDS.PROFILE,
    path: '/student/profile',
    label: 'My Profile',
    title: 'My Profile',
    subtitle: 'Your account and academic profile.',
    icon: UserRound,
    allowedRoles: [ROLES.STUDENT],
  },
  [STUDENT_ROUTE_IDS.FEEDBACK]: {
    id: STUDENT_ROUTE_IDS.FEEDBACK,
    path: '/student/feedback',
    label: 'Feedback',
    title: 'Feedback',
    subtitle: 'Help us improve AILA for every program.',
    icon: MessageSquareHeart,
    allowedRoles: [ROLES.STUDENT],
  },
};

export const STUDENT_NAV_GROUPS = [
  {
    label: 'Learn',
    items: [
      STUDENT_ROUTES[STUDENT_ROUTE_IDS.DASHBOARD],
      STUDENT_ROUTES[STUDENT_ROUTE_IDS.ASSISTANT],
      STUDENT_ROUTES[STUDENT_ROUTE_IDS.HUB],
      STUDENT_ROUTES[STUDENT_ROUTE_IDS.RESOURCES],
      STUDENT_ROUTES[STUDENT_ROUTE_IDS.PLANNER],
    ],
  },
  {
    label: 'Insights',
    items: [
      STUDENT_ROUTES[STUDENT_ROUTE_IDS.ANALYTICS],
      STUDENT_ROUTES[STUDENT_ROUTE_IDS.NOTIFICATIONS],
    ],
  },
  {
    label: 'Account',
    items: [
      STUDENT_ROUTES[STUDENT_ROUTE_IDS.PROFILE],
      STUDENT_ROUTES[STUDENT_ROUTE_IDS.FEEDBACK],
    ],
  },
];

export const STUDENT_ROUTE_ALIASES = {
  dashboard: STUDENT_ROUTE_IDS.DASHBOARD,
  assistant: STUDENT_ROUTE_IDS.ASSISTANT,
  hub: STUDENT_ROUTE_IDS.HUB,
  resources: STUDENT_ROUTE_IDS.RESOURCES,
  planner: STUDENT_ROUTE_IDS.PLANNER,
  analytics: STUDENT_ROUTE_IDS.ANALYTICS,
  notifications: STUDENT_ROUTE_IDS.NOTIFICATIONS,
  profile: STUDENT_ROUTE_IDS.PROFILE,
  feedback: STUDENT_ROUTE_IDS.FEEDBACK,
};

export function getStudentRouteByPath(pathname) {
  return Object.values(STUDENT_ROUTES).find((route) => route.path === pathname) ?? null;
}
