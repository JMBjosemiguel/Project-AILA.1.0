import { useState } from 'react';
import { Mail } from 'lucide-react';
import AuthInput from '../../../components/auth/AuthInput';
import Button from '../../../components/common/Button';
import { useAuth } from '../../../contexts/AuthContext';
import AuthLayout from '../../../layouts/AuthLayout/AuthLayout';

export default function ForgotPasswordPage({ onGoToLogin }) {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (event) => {
    event.preventDefault();

    if (!email.trim()) {
      setError('Enter your email to continue.');
      return;
    }

    setError('');
    try {
      setIsSubmitting(true);
      // The backend always resolves the same way here regardless of whether
      // the email has an account — an error only ever means a real problem
      // (network, rate limit), never "no such account".
      await forgotPassword(email.trim());
      setSent(true);
    } catch (forgotError) {
      setError(forgotError.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout title="Check your email" subtitle="Password reset requested">
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <Mail size={40} className="text-primary" />
          <div>
            <h3 className="text-base font-semibold text-ink-800">If an account exists for that email, we sent a reset link.</h3>
            <p className="mt-1.5 text-sm text-ink-400">
              Check your inbox and follow the link to set a new password. It expires in about 30 minutes.
            </p>
          </div>
          <button type="button" onClick={onGoToLogin} className="text-xs font-semibold text-primary hover:underline">
            Back to sign in
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Forgot your password?" subtitle="We'll email you a link to reset it">
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <AuthInput
          label="Email"
          icon={Mail}
          type="email"
          placeholder="you@university.edu"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        {error && <p className="text-xs text-rose-600 -mt-1">{error}</p>}

        <Button type="submit" full disabled={isSubmitting}>{isSubmitting ? 'Sending...' : 'Send reset link'}</Button>

        <button type="button" onClick={onGoToLogin} className="text-center text-xs font-semibold text-primary hover:underline">
          Back to sign in
        </button>
      </form>
    </AuthLayout>
  );
}
