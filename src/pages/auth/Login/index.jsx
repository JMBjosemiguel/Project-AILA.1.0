import { useState } from 'react';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import AuthInput from '../../../components/auth/AuthInput';
import Button from '../../../components/common/Button';
import { useAuth } from '../../../contexts/AuthContext';
import AuthLayout from '../../../layouts/AuthLayout/AuthLayout';

export default function LoginPage({ onAuthenticated, onGoToRegister }) {
  const { login, resendVerification } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendState, setResendState] = useState('idle'); // idle | sending | sent | error
  const [resendMessage, setResendMessage] = useState('');

  const submit = async (event) => {
    event.preventDefault();

    if (!email.trim() || !password.trim()) {
      setError('Enter your email and password to continue.');
      return;
    }

    setNeedsVerification(false);
    setResendState('idle');
    setResendMessage('');

    try {
      setIsSubmitting(true);
      const session = await login({ email, password });
      setError('');
      onAuthenticated(session.user.role);
    } catch (authError) {
      setError(authError.message);
      setNeedsVerification(authError.details?.code === 'EMAIL_NOT_VERIFIED');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    setResendState('sending');
    setResendMessage('');
    try {
      const result = await resendVerification(email.trim());
      setResendState('sent');
      setResendMessage(
        result?.alreadyVerified ? 'This email is already verified — try signing in again.' : 'Verification email sent. Please check your inbox.'
      );
    } catch (resendError) {
      setResendState('error');
      setResendMessage(resendError.message || 'Could not resend the verification email. Please try again.');
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to continue your learning">
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <AuthInput
          label="Email"
          icon={Mail}
          placeholder="student@example.edu"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <AuthInput
          label="Password"
          icon={Lock}
          type={showPassword ? 'text' : 'password'}
          placeholder="Enter your password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          rightElement={
            <button type="button" onClick={() => setShowPassword((current) => !current)} className="text-ink-400 hover:text-primary">
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          }
        />

        {error && <p className="text-xs text-rose-600 -mt-1">{error}</p>}

        {needsVerification && (
          <div className="-mt-1 flex flex-col gap-1.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <button
              type="button"
              onClick={handleResend}
              disabled={resendState === 'sending'}
              className="text-xs font-semibold text-primary hover:underline disabled:opacity-60"
            >
              {resendState === 'sending' ? 'Sending...' : 'Resend verification email'}
            </button>
            {resendMessage && (
              <p className={`text-xs ${resendState === 'error' ? 'text-rose-600' : 'text-emerald-600'}`}>{resendMessage}</p>
            )}
          </div>
        )}

        <Button type="submit" full disabled={isSubmitting}>{isSubmitting ? 'Signing in...' : 'Sign in'}</Button>

        <div className="flex items-center gap-3 text-xs text-ink-400 my-1">
          <div className="flex-1 h-px bg-ink-100" />or<div className="flex-1 h-px bg-ink-100" />
        </div>

        <Button type="button" variant="outline" full onClick={onGoToRegister}>
          Create student account
        </Button>
      </form>
    </AuthLayout>
  );
}
