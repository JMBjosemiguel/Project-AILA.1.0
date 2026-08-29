import { BarChart3, BookOpen, CalendarCheck2, Sparkles } from 'lucide-react';
import AilaOrb from '../../components/common/AilaOrb';

const FEATURES = [
  {
    icon: Sparkles,
    label: 'Personalized AI learning assistance',
  },
  {
    icon: BookOpen,
    label: 'Centralized learning resources',
  },
  {
    icon: CalendarCheck2,
    label: 'Smart study planner & task management',
  },
  {
    icon: BarChart3,
    label: 'Learning analytics & progress insights',
  },
];

export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="min-h-screen flex bg-canvas">
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden bg-ink-800 flex-col justify-between p-12">
        <div
          className="absolute inset-0 opacity-70"
          style={{
            background: 'radial-gradient(ellipse at 20% 15%, rgba(37,99,235,.45) 0%, transparent 55%), radial-gradient(ellipse at 85% 85%, rgba(56,189,248,.3) 0%, transparent 50%)',
          }}
        />
        <div className="relative z-10 flex items-center gap-3">
          <AilaOrb size={36} />
          <div>
            <div className="font-display font-bold text-white text-lg leading-tight">AILA</div>
            <div className="text-xs text-white/50">Adaptive Intelligent Learning Assistant</div>
          </div>
        </div>

        <div className="relative z-10">
          <h1 className="font-display text-4xl font-bold text-white leading-tight tracking-tight">
            AILA<br />
            <span className="bg-gradient-to-r from-primary-300 to-accent bg-clip-text text-transparent"> Learn Smarter. Study Better. Achieve More.</span>
          </h1>
          <p className="text-white/60 text-[0.95rem] mt-4 leading-relaxed max-w-md">
            AILA is an AI-powered learning support system designed to help college students understand lessons, organize study tasks, access learning materials, and receive personalized academic assistance—all in one platform.
          </p>

          <div className="flex flex-col gap-3 mt-8">
            {FEATURES.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3 text-white/80 text-sm">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  <Icon size={15} />
                </div>
                {label}
              </div>
            ))}
          </div>
        </div>

            <div className="relative z-10 flex flex-col gap-3">
              <FloatCard className="ml-10" color="bg-violet-500" text="👋 Welcome back! Ready to study?" />
              <FloatCard color="bg-emerald-500" text="✅ Here's a simple explanation..." />
              <FloatCard className="ml-10" color="bg-violet-500" text="📅 You have 2 assignments due this week." />
              <FloatCard color="bg-pink-500" text="🏆 Great job! You've completed today's study goal." />
            </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 sm:p-10"> 
        <div className="w-full max-w-[400px]">
          <div className="lg:hidden flex items-center gap-2.5 justify-center mb-8">
            <AilaOrb size={30} />
            <span className="font-display font-bold text-ink-800">AILA</span>
          </div>
          <div className="bg-white border border-ink-100 rounded-2xl shadow-card p-8">
            <div className="mb-6">
              <h2 className="font-display text-xl font-bold text-ink-800">{title}</h2>
              {subtitle && <p className="text-sm text-ink-400 mt-1">{subtitle}</p>}
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function FloatCard({ text, color, className = '' }) {
  return (
    <div className={`inline-flex items-center gap-2.5 bg-white/10 backdrop-blur-md border border-white/15 rounded-xl px-3.5 py-2 text-xs text-white w-fit ${className}`}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
      {text}
    </div>
  );
}
