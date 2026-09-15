import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, GraduationCap, Hash, Lock, Mail, MailCheck, User } from 'lucide-react';
import AuthInput from '../../../components/auth/AuthInput';
import Button from '../../../components/common/Button';
import { useAuth } from '../../../contexts/AuthContext';
import AuthLayout from '../../../layouts/AuthLayout/AuthLayout';
import { maskEmail } from '../../../utils/maskEmail';

const INITIAL_FORM = {
  first_name: '',
  last_name: '',
  student_number: '',
  email: '',
  program: '',
  year_level: '',
  password: '',
  confirm_password: '',
};

const RESEND_COOLDOWN_SECONDS = 30;

export default function RegisterPage({ onRegistered, onGoToLogin }) {
  const { register, resendVerification } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [resendState, setResendState] = useState('idle'); // idle | sending | sent | error
  const [resendMessage, setResendMessage] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef(null);

  useEffect(() => () => window.clearInterval(cooldownRef.current), []);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();

    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim() || !form.password.trim()) {
      setError('First name, last name, email, and password are required.');
      return;
    }

    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (form.password !== form.confirm_password) {
      setError('Password confirmation does not match.');
      return;
    }

    try {
      setIsSubmitting(true);
      await register(form);
      setError('');
      setRegisteredEmail(form.email.trim());
      onRegistered?.();
    } catch (authError) {
      setError(authError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN_SECONDS);
    window.clearInterval(cooldownRef.current);
    cooldownRef.current = window.setInterval(() => {
      setCooldown((current) => {
        if (current <= 1) {
          window.clearInterval(cooldownRef.current);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  };

  const handleResend = async () => {
    setResendState('sending');
    setResendMessage('');
    try {
      const result = await resendVerification(registeredEmail);
      setResendState('sent');
      setResendMessage(
        result?.alreadyVerified ? 'This email is already verified. You can sign in now.' : 'Verification email sent again.'
      );
      startCooldown();
    } catch (resendError) {
      setResendState('error');
      setResendMessage(resendError.message || 'Could not resend the verification email. Please try again.');
    }
  };

  if (registeredEmail) {
    return (
      <AuthLayout title="Check your email" subtitle="One more step to activate your account">
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <MailCheck size={40} className="text-primary" />
          <div>
            <h3 className="text-base font-semibold text-ink-800">Check your email</h3>
            <p className="mt-1.5 text-sm text-ink-400">
              We sent a verification link to <span className="font-semibold text-ink-700">{maskEmail(registeredEmail)}</span>.
              Click the link to activate your account, then sign in.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            full
            disabled={resendState === 'sending' || cooldown > 0}
            onClick={handleResend}
          >
            {resendState === 'sending' ? 'Sending...' : cooldown > 0 ? `Resend available in ${cooldown}s` : 'Resend verification email'}
          </Button>

          {resendMessage && (
            <p className={`text-xs ${resendState === 'error' ? 'text-rose-600' : 'text-emerald-600'}`}>{resendMessage}</p>
          )}

          <button type="button" onClick={onGoToLogin} className="text-xs font-semibold text-primary hover:underline">
            Back to sign in
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Create your account" subtitle="Set up your student profile">
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <AuthInput label="First name" icon={User} placeholder="First name" value={form.first_name} onChange={update('first_name')} />
          <AuthInput label="Last name" placeholder="Last name" value={form.last_name} onChange={update('last_name')} />
        </div>

        <AuthInput label="Email" icon={Mail} type="email" placeholder="you@university.edu" value={form.email} onChange={update('email')} />
        <AuthInput label="Student number" icon={Hash} placeholder="Optional" value={form.student_number} onChange={update('student_number')} />
        <AuthInput label="Program" icon={GraduationCap} placeholder="Optional" value={form.program} onChange={update('program')} />

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_96px] gap-3">
          <AuthInput
            label="Password"
            icon={Lock}
            type={showPassword ? 'text' : 'password'}
            placeholder="Min. 8 characters"
            value={form.password}
            onChange={update('password')}
            rightElement={
              <button type="button" onClick={() => setShowPassword((current) => !current)} className="text-ink-400 hover:text-primary">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
          />
          <AuthInput label="Year" type="number" min="1" max="6" placeholder="1" value={form.year_level} onChange={update('year_level')} />
        </div>

        <AuthInput
          label="Confirm password"
          icon={Lock}
          type={showPassword ? 'text' : 'password'}
          placeholder="Repeat password"
          value={form.confirm_password}
          onChange={update('confirm_password')}
        />

        {error && <p className="text-xs text-rose-600">{error}</p>}

        <Button type="submit" full disabled={isSubmitting}>{isSubmitting ? 'Creating account...' : 'Create account'}</Button>

        <p className="text-center text-xs text-ink-400">
          Already have an account?{' '}
          <button type="button" onClick={onGoToLogin} className="text-primary font-semibold hover:underline">Sign in</button>
        </p>
      </form>
    </AuthLayout>
  );
}
