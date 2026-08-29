import { useState } from 'react';
import { Eye, EyeOff, GraduationCap, Hash, Lock, Mail, User } from 'lucide-react';
import AuthInput from '../../../components/auth/AuthInput';
import Button from '../../../components/common/Button';
import { useAuth } from '../../../contexts/AuthContext';
import AuthLayout from '../../../layouts/AuthLayout/AuthLayout';

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

export default function RegisterPage({ onRegistered, onGoToLogin }) {
  const { register } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      setSuccess('Account created. Redirecting to login...');
      window.setTimeout(onRegistered, 700);
    } catch (authError) {
      setSuccess('');
      setError(authError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Create your account" subtitle="Set up your student profile">
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <div className="grid grid-cols-2 gap-3">
          <AuthInput label="First name" icon={User} placeholder="First name" value={form.first_name} onChange={update('first_name')} />
          <AuthInput label="Last name" placeholder="Last name" value={form.last_name} onChange={update('last_name')} />
        </div>

        <AuthInput label="Email" icon={Mail} type="email" placeholder="you@university.edu" value={form.email} onChange={update('email')} />
        <AuthInput label="Student number" icon={Hash} placeholder="Optional" value={form.student_number} onChange={update('student_number')} />
        <AuthInput label="Program" icon={GraduationCap} placeholder="Optional" value={form.program} onChange={update('program')} />

        <div className="grid grid-cols-[1fr_96px] gap-3">
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
        {success && <p className="text-xs text-emerald-600">{success}</p>}

        <Button type="submit" full disabled={isSubmitting}>{isSubmitting ? 'Creating account...' : 'Create account'}</Button>

        <p className="text-center text-xs text-ink-400">
          Already have an account?{' '}
          <button type="button" onClick={onGoToLogin} className="text-primary font-semibold hover:underline">Sign in</button>
        </p>
      </form>
    </AuthLayout>
  );
}
