import { Sparkles } from 'lucide-react';
import Button from '../../common/Button';
import ProgressBar from '../../common/ProgressBar';

// Mirrors the server's gamification helper: level = floor(xp / 100) + 1, so each
// level is a flat 100 XP and "progress into this level" is xp - (level - 1) * 100.
const XP_PER_LEVEL = 100;

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export default function WelcomeHeader({ profile, onAskAI }) {
  const firstName = profile?.first_name;
  const xp = Math.max(0, Math.round(Number(profile?.xp_points) || 0));
  const level = profile?.level || Math.floor(xp / XP_PER_LEVEL) + 1;
  const xpIntoLevel = xp - (level - 1) * XP_PER_LEVEL;
  const pct = Math.min(100, Math.max(0, xpIntoLevel));

  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
      <div>
        <h2 className="font-display text-xl font-bold text-ink-800">
          {greeting()}{firstName ? `, ${firstName}` : ''}
        </h2>
        <p className="text-sm text-ink-400 mt-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
        <div className="flex items-center gap-3 mt-3 max-w-xs">
          <ProgressBar value={pct} color="#2563EB" className="flex-1" />
          <span className="text-xs font-semibold text-ink-600 whitespace-nowrap">
            Lvl {level} &middot; {xpIntoLevel}/{XP_PER_LEVEL} XP
          </span>
        </div>
      </div>
      <Button icon={<Sparkles size={16} />} onClick={onAskAI}>
        Ask AILA
      </Button>
    </div>
  );
}
