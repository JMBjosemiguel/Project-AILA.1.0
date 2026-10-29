import { Sparkles } from 'lucide-react';
import Button from '../../common/Button';

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

// Level and XP live in the compact progress row lower on the dashboard
// (StudyProgressRow), so the header stays about studying.
export default function WelcomeHeader({ profile, onAskAI }) {
  const firstName = profile?.first_name;

  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
      <div>
        <h2 className="font-display text-xl font-bold text-ink-800">
          {greeting()}{firstName ? `, ${firstName}` : ''}
        </h2>
        <p className="text-sm text-ink-400 mt-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>
      <Button icon={<Sparkles size={16} />} onClick={onAskAI}>
        Ask AILA
      </Button>
    </div>
  );
}
