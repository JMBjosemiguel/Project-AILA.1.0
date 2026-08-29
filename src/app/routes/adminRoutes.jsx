import {
  BarChart3,
  BookOpen,
  ClipboardList,
  FolderOpen,
  LayoutDashboard,
  LineChart,
  Megaphone,
  ScrollText,
  Users,
} from 'lucide-react';
import { ROLES } from '../../constants/roles';

export const ADMIN_ROUTE_IDS = {
  DASHBOARD: 'admin.dashboard',
  USERS: 'admin.users',
  KNOWLEDGE_BASE: 'admin.knowledgeBase',
  RESOURCES: 'admin.resources',
  CHATBOT_RULES: 'admin.chatbotRules',
  CHAT_SESSIONS: 'admin.chatSessions',
  FEEDBACK: 'admin.feedback',
  AUDIT_LOG: 'admin.auditLog',
  SETTINGS: 'admin.settings',
};

export const ADMIN_ROUTES = {
  [ADMIN_ROUTE_IDS.DASHBOARD]: {
    id: ADMIN_ROUTE_IDS.DASHBOARD,
    path: '/admin',
    label: 'Dashboard',
    title: 'Admin Dashboard',
    subtitle: 'A snapshot of activity across AILA.',
    icon: LayoutDashboard,
    allowedRoles: [ROLES.ADMIN],
  },
  [ADMIN_ROUTE_IDS.USERS]: {
    id: ADMIN_ROUTE_IDS.USERS,
    path: '/admin/users',
    label: 'Users',
    title: 'Users',
    subtitle: 'Manage roles, users, and profiles.',
    icon: Users,
    allowedRoles: [ROLES.ADMIN],
  },
  [ADMIN_ROUTE_IDS.KNOWLEDGE_BASE]: {
    id: ADMIN_ROUTE_IDS.KNOWLEDGE_BASE,
    path: '/admin/knowledge-base',
    label: 'Learning Management',
    title: 'Learning Management',
    subtitle: 'View, archive, and manage every AI-generated course.',
    icon: BookOpen,
    allowedRoles: [ROLES.ADMIN],
  },
  [ADMIN_ROUTE_IDS.RESOURCES]: {
    id: ADMIN_ROUTE_IDS.RESOURCES,
    path: '/admin/resources',
    label: 'Resources',
    title: 'Resources',
    subtitle: 'Manage resource categories, resources, and subject/topic links.',
    icon: FolderOpen,
    allowedRoles: [ROLES.ADMIN],
  },
  [ADMIN_ROUTE_IDS.CHATBOT_RULES]: {
    id: ADMIN_ROUTE_IDS.CHATBOT_RULES,
    path: '/admin/chatbot-rules',
    label: 'Analytics',
    title: 'Analytics',
    subtitle: 'Platform-wide trends across registrations, AI usage, and learning outcomes.',
    icon: LineChart,
    allowedRoles: [ROLES.ADMIN],
  },
  [ADMIN_ROUTE_IDS.CHAT_SESSIONS]: {
    id: ADMIN_ROUTE_IDS.CHAT_SESSIONS,
    path: '/admin/chat-sessions',
    label: 'Chat Sessions',
    title: 'Chat Sessions',
    subtitle: 'Review conversations, messages, and unknown questions.',
    icon: BarChart3,
    allowedRoles: [ROLES.ADMIN],
  },
  [ADMIN_ROUTE_IDS.FEEDBACK]: {
    id: ADMIN_ROUTE_IDS.FEEDBACK,
    path: '/admin/feedback',
    label: 'Feedback',
    title: 'Feedback',
    subtitle: 'Review ratings, comments, and feature feedback.',
    icon: ClipboardList,
    allowedRoles: [ROLES.ADMIN],
  },
  [ADMIN_ROUTE_IDS.AUDIT_LOG]: {
    id: ADMIN_ROUTE_IDS.AUDIT_LOG,
    path: '/admin/audit-log',
    label: 'Audit Log',
    title: 'Audit Log',
    subtitle: 'Track administrator changes.',
    icon: ScrollText,
    allowedRoles: [ROLES.ADMIN],
  },
  [ADMIN_ROUTE_IDS.SETTINGS]: {
    id: ADMIN_ROUTE_IDS.SETTINGS,
    path: '/admin/settings',
    label: 'Announcements',
    title: 'Announcements',
    subtitle: 'Create and manage announcements sent to students.',
    icon: Megaphone,
    allowedRoles: [ROLES.ADMIN],
  },
};

export const ADMIN_NAV_GROUPS = [
  {
    label: 'Operations',
    items: [
      ADMIN_ROUTES[ADMIN_ROUTE_IDS.DASHBOARD],
      ADMIN_ROUTES[ADMIN_ROUTE_IDS.USERS],
      ADMIN_ROUTES[ADMIN_ROUTE_IDS.KNOWLEDGE_BASE],
      ADMIN_ROUTES[ADMIN_ROUTE_IDS.RESOURCES],
    ],
  },
  {
    label: 'AILA Brain',
    items: [
      ADMIN_ROUTES[ADMIN_ROUTE_IDS.CHATBOT_RULES],
      ADMIN_ROUTES[ADMIN_ROUTE_IDS.CHAT_SESSIONS],
    ],
  },
  {
    label: 'Governance',
    items: [
      ADMIN_ROUTES[ADMIN_ROUTE_IDS.FEEDBACK],
      ADMIN_ROUTES[ADMIN_ROUTE_IDS.AUDIT_LOG],
      ADMIN_ROUTES[ADMIN_ROUTE_IDS.SETTINGS],
    ],
  },
];

export const ADMIN_ROUTE_ALIASES = {
  dashboard: ADMIN_ROUTE_IDS.DASHBOARD,
  users: ADMIN_ROUTE_IDS.USERS,
  knowledgeBase: ADMIN_ROUTE_IDS.KNOWLEDGE_BASE,
  resources: ADMIN_ROUTE_IDS.RESOURCES,
  chatbotRules: ADMIN_ROUTE_IDS.CHATBOT_RULES,
  chatSessions: ADMIN_ROUTE_IDS.CHAT_SESSIONS,
  feedback: ADMIN_ROUTE_IDS.FEEDBACK,
  auditLog: ADMIN_ROUTE_IDS.AUDIT_LOG,
  settings: ADMIN_ROUTE_IDS.SETTINGS,
};

export function getAdminRouteByPath(pathname) {
  return Object.values(ADMIN_ROUTES).find((route) => route.path === pathname) ?? null;
}
