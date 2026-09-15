import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import Button from '../../../components/common/Button';
import { useAuth } from '../../../contexts/AuthContext';
import AuthLayout from '../../../layouts/AuthLayout/AuthLayout';

// verifyEmail's ApiClientError carries `.details.code` from the backend:
// TOKEN_INVALID | TOKEN_USED | TOKEN_EXPIRED. TOKEN_USED folds into the same
// "invalid" state as TOKEN_INVALID — a consumed link and a garbage link both
// just mean "this link doesn't work anymore".
function codeToStatus(code) {
  if (code === 'TOKEN_EXPIRED') return 'expired';
  if (code === 'TOKEN_INVALID' || code === 'TOKEN_USED') return 'invalid';
  return 'error';
}

const STATUS_CONTENT = {
  verifying: {
    icon: Loader2,
    iconClassName: 'text-primary animate-spin',
    title: 'Verifying your email...',
    message: 'Please wait a moment.',
  },
  success: {
    icon: CheckCircle2,
    iconClassName: 'text-emerald-500',
    title: 'Email verified successfully.',
    message: 'You may now sign in to AILA.',
  },
  'already-verified': {
    icon: CheckCircle2,
    iconClassName: 'text-emerald-500',
    title: 'Your email is already verified.',
    message: 'You can sign in to AILA now.',
  },
  invalid: {
    icon: XCircle,
    iconClassName: 'text-rose-500',
    title: 'This link is invalid.',
    message: 'It may have already been used, or the link was copied incorrectly. Request a new one from the sign-in page.',
  },
  expired: {
    icon: Clock,
    iconClassName: 'text-amber-500',
    title: 'This link has expired.',
    message: 'Verification links are only valid for about 30 minutes. Request a new one from the sign-in page.',
  },
  error: {
    icon: AlertTriangle,
    iconClassName: 'text-rose-500',
    title: "Couldn't verify your email.",
    message: 'Something went wrong on our end. Please try again in a moment.',
  },
};

export default function VerifyEmailPage({ onGoToLogin }) {
  const { verifyEmail } = useAuth();
  const [status, setStatus] = useState('verifying');

  useEffect(() => {
    let active = true;
    const token = new URLSearchParams(window.location.search).get('token');

    if (!token) {
      setStatus('invalid');
      return undefined;
    }

    verifyEmail(token)
      .then((data) => {
        if (!active) return;
        setStatus(data?.alreadyVerified ? 'already-verified' : 'success');
      })
      .catch((error) => {
        if (!active) return;
        setStatus(codeToStatus(error?.details?.code));
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const content = STATUS_CONTENT[status];
  const Icon = content.icon;
  const showSignIn = status === 'success' || status === 'already-verified' || status === 'invalid' || status === 'expired';

  return (
    <AuthLayout title="Email verification" subtitle="AILA account verification">
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <Icon size={40} className={content.iconClassName} />
        <div>
          <h3 className="text-base font-semibold text-ink-800">{content.title}</h3>
          <p className="mt-1.5 text-sm text-ink-400">{content.message}</p>
        </div>
        {showSignIn && (
          <Button type="button" full onClick={onGoToLogin} className="mt-2">
            Sign In
          </Button>
        )}
      </div>
    </AuthLayout>
  );
}
