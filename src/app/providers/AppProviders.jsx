import { AuthProvider } from '../../contexts/AuthContext';
import { ToastProvider } from '../../components/common/Toast';
import { ConfirmProvider } from '../../components/common/ConfirmDialog';

export default function AppProviders({ children }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
