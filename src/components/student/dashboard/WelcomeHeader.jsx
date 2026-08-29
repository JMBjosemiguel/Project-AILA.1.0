import { Sparkles } from 'lucide-react';
import Button from '../../common/Button';
import ProgressBar from '../../common/ProgressBar';

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export default function WelcomeHeader({ profile, onAskAI }) {
  const firstName = profile?.first_name;
  const xp = profile?.xp_points ?? 0;
  const level = profile?.level;
  const pct = xp ? ((xp % 500) / 500) * 100 : 0;

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
            {level ? `Lvl ${level} - ` : ''}{xp} XP
          </span>
        </div>
      </div>
      <Button icon={<Sparkles size={16} />} onClick={onAskAI}>
        Ask AILA
      </Button>
    </div>
  );
}
