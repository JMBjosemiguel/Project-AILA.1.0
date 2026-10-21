import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authService } from '../services/api/authService';

const AuthContext = createContext({
  user: null,
  role: null,
  authenticated: false,
  isAuthenticated: false,
  loading: true,
  isReady: false,
  error: null,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  getCurrentUser: async () => {},
  refreshSession: async () => {},
  verifyEmail: async () => {},
  resendVerification: async () => {},
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    authService.refreshSession()
      .then((nextSession) => {
        if (active) setSession(nextSession);
      })
      .catch((sessionError) => {
        if (active) setError(sessionError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(() => {
    const user = session?.user ?? null;
    const authenticated = Boolean(user);

    return {
      user,
      role: user?.role ?? null,
      authenticated,
      isAuthenticated: authenticated,
      loading,
      isReady: !loading,
      error,
      async login(credentials, options) {
        setError(null);
        try {
          const nextSession = await authService.login(credentials, options);
          setSession(nextSession);
          return nextSession;
        } catch (loginError) {
          setError(loginError.message);
          throw loginError;
        }
      },
      async register(payload) {
        setError(null);
        try {
          return await authService.register(payload);
        } catch (registerError) {
          setError(registerError.message);
          throw registerError;
        }
      },
      async logout() {
        try {
          await authService.logout();
        } finally {
          // authService.logout() already clears the stored token in its own
          // finally even if the POST fails — the session must clear here
          // too, so a dropped connection at logout time never leaves the
          // student stuck looking signed in on a token that's already gone.
          setSession(null);
        }
      },
      // Neither of these touches the session — verification happens while
      // signed out, and resend never authenticates anyone.
      async verifyEmail(token) {
        return authService.verifyEmail(token);
      },
      async resendVerification(email) {
        return authService.resendVerification(email);
      },
      async getCurrentUser() {
        try {
          const user = await authService.getCurrentUser();
          setSession((current) => ({ token: current?.token ?? null, user }));
          return user;
        } catch (currentUserError) {
          setError(currentUserError.message);
          throw currentUserError;
        }
      },
      async refreshSession() {
        setLoading(true);
        setError(null);
        try {
          const nextSession = await authService.refreshSession();
          setSession(nextSession);
          return nextSession;
        } catch (refreshError) {
          setError(refreshError.message);
          throw refreshError;
        } finally {
          setLoading(false);
        }
      },
    };
  }, [error, loading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
