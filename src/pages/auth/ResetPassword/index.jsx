import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Lock } from 'lucide-react';
import AuthInput from '../../../components/auth/AuthInput';
import Button from '../../../components/common/Button';
import { useAuth } from '../../../contexts/AuthContext';
import AuthLayout from '../../../layouts/AuthLayout/AuthLayout';

export default function ResetPasswordPage({ onGoToLogin, onGoToForgotPassword }) {
  const { resetPassword } = useAuth();
  const token = new URLSearchParams(window.location.search).get('token');
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [linkError, setLinkError] = useState(token ? '' : 'This password reset link is invalid.');

  const submit = async (event) => {
    event.preventDefault();

    if (!token) {
      setLinkError('This password reset link is invalid.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Password confirmation does not match.');
      return;
    }

    setError('');
    try {
      setIsSubmitting(true);
      await resetPassword({ token, password });
      setSuccess(true);
    } catch (resetError) {
      // verifyEmail-style error codes — TOKEN_EXPIRED vs TOKEN_INVALID get a
      // distinct, actionable message; anything else is a real failure.
      const code = resetError.details?.code;
      if (code === 'TOKEN_EXPIRED') {
        setLinkError('This password reset link has expired. Please request a new one.');
      } else if (code === 'TOKEN_INVALID') {
        setLinkError('This password reset link is invalid or has already been used. Please request a new one.');
      } else {
        setError(resetError.message || 'Could not reset your password. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <AuthLayout title="Reset your password" subtitle="You're all set">
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <CheckCircle2 size={40} className="text-emerald-500" />
          <div>
            <h3 className="text-base font-semibold text-ink-800">Password updated</h3>
            <p className="mt-1.5 text-sm text-ink-400">You can now sign in with your new password.</p>
          </div>
          <Button type="button" full onClick={onGoToLogin}>Sign in</Button>
        </div>
      </AuthLayout>
    );
  }

  if (linkError) {
    return (
      <AuthLayout title="Reset your password" subtitle="Password reset">
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <AlertTriangle size={40} className="text-amber-500" />
          <h3 className="text-base font-semibold text-ink-800">{linkError}</h3>
          <Button type="button" full onClick={onGoToForgotPassword}>Request a new link</Button>
          <button type="button" onClick={onGoToLogin} className="text-xs font-semibold text-primary hover:underline">
            Back to sign in
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Reset your password" subtitle="Choose a new password">
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <AuthInput
          label="New password"
          icon={Lock}
          type={showPassword ? 'text' : 'password'}
          placeholder="Min. 8 characters"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          rightElement={
            <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="text-ink-400 hover:text-primary">
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          }
        />
        <AuthInput
          label="Confirm password"
          icon={Lock}
          type={showPassword ? 'text' : 'password'}
          placeholder="Repeat password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />

        {error && <p className="text-xs text-rose-600">{error}</p>}

        <Button type="submit" full disabled={isSubmitting}>{isSubmitting ? 'Updating...' : 'Update password'}</Button>
      </form>
    </AuthLayout>
  );
}
