import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, Mail, XCircle } from 'lucide-react';
import AuthInput from '../../../components/auth/AuthInput';
import Button from '../../../components/common/Button';
import { useAuth } from '../../../contexts/AuthContext';
import AuthLayout from '../../../layouts/AuthLayout/AuthLayout';

// verifyEmail's ApiClientError carries `.details.code` from the backend:
// TOKEN_INVALID | TOKEN_SUPERSEDED | TOKEN_EXPIRED. TOKEN_SUPERSEDED means a
// newer link was issued for the same account (a register retry or Resend) —
// distinct from a garbage/unknown token, so it gets its own state instead of
// folding into "invalid".
function codeToStatus(code) {
  if (code === 'TOKEN_EXPIRED') return 'expired';
  if (code === 'TOKEN_SUPERSEDED') return 'superseded';
  if (code === 'TOKEN_INVALID') return 'invalid';
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
    message: 'It may have already been used, or the link was copied incorrectly.',
  },
  superseded: {
    icon: AlertTriangle,
    iconClassName: 'text-amber-500',
    title: 'A newer verification link was sent.',
    message: 'Open the most recent AILA email, or request a new link below.',
  },
  expired: {
    icon: Clock,
    iconClassName: 'text-amber-500',
    title: 'This link has expired.',
    message: 'Verification links are only valid for about 30 minutes.',
  },
  error: {
    icon: AlertTriangle,
    iconClassName: 'text-rose-500',
    title: "Couldn't verify your email.",
    message: 'Something went wrong on our end. Please try again in a moment.',
  },
};

const RESEND_COOLDOWN_SECONDS = 30;
const RESEND_STATUSES = new Set(['invalid', 'superseded', 'expired']);

export default function VerifyEmailPage({ onGoToLogin }) {
  const { verifyEmail, resendVerification } = useAuth();
  const [status, setStatus] = useState('verifying');
  const [resendEmail, setResendEmail] = useState('');
  const [resendState, setResendState] = useState('idle'); // idle | sending | sent | error
  const [resendMessage, setResendMessage] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef(null);

  useEffect(() => () => window.clearInterval(cooldownRef.current), []);

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

  const handleResend = async (event) => {
    event.preventDefault();
    if (!resendEmail.trim()) return;

    setResendState('sending');
    setResendMessage('');
    try {
      // Generic "sent" reply either way — resendVerification never reveals
      // whether an account exists for this email.
      await resendVerification(resendEmail.trim());
      setResendState('sent');
      setResendMessage('If that email has an AILA account, a new verification link is on its way.');
      startCooldown();
    } catch (resendError) {
      setResendState('error');
      setResendMessage(resendError.message || 'Could not resend the verification email. Please try again.');
    }
  };

  const content = STATUS_CONTENT[status];
  const Icon = content.icon;
  const showSignIn = status === 'success' || status === 'already-verified' || RESEND_STATUSES.has(status);
  const showResend = RESEND_STATUSES.has(status);

  return (
    <AuthLayout title="Email verification" subtitle="AILA account verification">
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <Icon size={40} className={content.iconClassName} />
        <div>
          <h3 className="text-base font-semibold text-ink-800">{content.title}</h3>
          <p className="mt-1.5 text-sm text-ink-400">{content.message}</p>
        </div>

        {showResend && (
          <form className="w-full flex flex-col gap-3" onSubmit={handleResend}>
            <AuthInput
              label="Email"
              icon={Mail}
              type="email"
              placeholder="you@university.edu"
              value={resendEmail}
              onChange={(event) => setResendEmail(event.target.value)}
            />
            <Button type="submit" variant="outline" full disabled={resendState === 'sending' || cooldown > 0}>
              {resendState === 'sending' ? 'Sending...' : cooldown > 0 ? `Resend available in ${cooldown}s` : 'Resend verification email'}
            </Button>
            {resendMessage && (
              <p className={`text-xs ${resendState === 'error' ? 'text-rose-600' : 'text-emerald-600'}`}>{resendMessage}</p>
            )}
          </form>
        )}

        {showSignIn && (
          <Button type="button" full={!showResend} variant={showResend ? 'ghost' : 'primary'} onClick={onGoToLogin} className="mt-2">
            Sign in
          </Button>
        )}
      </div>
    </AuthLayout>
  );
}
