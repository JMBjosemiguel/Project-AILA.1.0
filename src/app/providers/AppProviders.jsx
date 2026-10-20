import { AuthProvider } from '../../contexts/AuthContext';
import { ToastProvider } from '../../components/common/Toast';
import { ConfirmProvider } from '../../components/common/ConfirmDialog';
import ConnectivityBanner from '../../components/common/ConnectivityBanner';

export default function AppProviders({ children }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <ConnectivityBanner />
          {children}
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
