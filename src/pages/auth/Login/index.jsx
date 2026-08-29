import { useState } from 'react';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import AuthInput from '../../../components/auth/AuthInput';
import Button from '../../../components/common/Button';
import { useAuth } from '../../../contexts/AuthContext';
import AuthLayout from '../../../layouts/AuthLayout/AuthLayout';

export default function LoginPage({ onAuthenticated, onGoToRegister }) {
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();

    if (!email.trim() || !password.trim()) {
      setError('Enter your email and password to continue.');
      return;
    }

    try {
      setIsSubmitting(true);
      const session = await login({ email, password });
      setError('');
      onAuthenticated(session.user.role);
    } catch (authError) {
      setError(authError.message);
    } finally {
      setIsSubmitting(false);
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
