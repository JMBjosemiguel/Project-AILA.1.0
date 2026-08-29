import { ArrowRight, BookOpenCheck, CheckCheck, ChevronDown, CheckCircle2, Circle, Sparkles, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import Card from '../../common/Card';
import ActionMenu from '../../common/ActionMenu';
import { domainColor, domainTint } from '../../common/DomainChip';
import ProgressBar from '../../common/ProgressBar';

const DIFFICULTY_STYLE = {
  beginner: 'bg-emerald-50 text-emerald-600',
  intermediate: 'bg-amber-50 text-amber-600',
  advanced: 'bg-rose-50 text-rose-600',
};

function findFirstIncompleteLesson(modules) {
  for (const module_ of modules) {
    for (const topic of module_.topics ?? []) {
      const lesson = (topic.lessons ?? []).find((item) => !item.completed);
      if (lesson) return lesson;
    }
  }
  return null;
}

function summarizeCourse(modules) {
  let lessonCount = 0;
  let totalMinutes = 0;
  for (const module_ of modules) {
    for (const topic of module_.topics ?? []) {
      for (const lesson of topic.lessons ?? []) {
        lessonCount += 1;
        totalMinutes += lesson.estimated_minutes || 0;
      }
    }
  }
  return { moduleCount: modules.length, lessonCount, totalMinutes };
}

function formatMinutes(totalMinutes) {
  if (!totalMinutes) return null;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `~${hours}h ${minutes}m`;
  if (hours) return `~${hours}h`;
  return `~${minutes}m`;
}

export default function SubjectCard({ subject, onSelectLesson, onDelete }) {
  const [open, setOpen] = useState(false);
  const [openModuleId, setOpenModuleId] = useState(null);
  const color = domainColor(subject);
  const tint = domainTint(subject);
  const modules = subject.modules ?? [];
  const nextLesson = findFirstIncompleteLesson(modules);
  const { moduleCount, lessonCount, totalMinutes } = useMemo(() => summarizeCourse(modules), [modules]);
  const estimatedLabel = formatMinutes(totalMinutes);

  const menuItems = [
    ...(nextLesson ? [{ label: 'Open', icon: <BookOpenCheck size={14} />, onClick: () => onSelectLesson?.(nextLesson.id) }] : []),
    { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => onDelete?.(subject) },
  ];

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="w-full flex items-center gap-3 p-4">
        <button onClick={() => setOpen((current) => !current)} className="flex-1 flex items-center gap-3 text-left min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-display font-bold text-sm flex-shrink-0" style={{ background: tint, color }}>
            {(subject.name ?? subject.code ?? '').slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-ink-800 truncate">{subject.name}</span>
              {subject.is_ai_generated && (
                <span className="inline-flex items-center gap-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-primary bg-primary-50 px-1.5 py-0.5 rounded-full flex-shrink-0">
                  <Sparkles size={9} /> AI
                </span>
              )}
            </div>
            <div className="text-xs text-ink-400">{subject.code || (subject.difficulty ? `${subject.difficulty} level` : '')}</div>
          </div>
        </button>
        {nextLesson && (
          <button
            onClick={() => onSelectLesson?.(nextLesson.id)}
            className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-600 flex-shrink-0"
          >
            Continue <ArrowRight size={12} />
          </button>
        )}
        <ActionMenu items={menuItems} label={`Course actions for ${subject.name}`} />
        <button onClick={() => setOpen((current) => !current)} aria-label={open ? 'Collapse course' : 'Expand course'} className="flex-shrink-0">
          <ChevronDown size={16} className={`text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      <div className="px-4 pb-4 flex items-center gap-2 flex-wrap">
        {subject.progress_percent === 100 && (
          <span className="inline-flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
            <CheckCheck size={10} /> Completed
          </span>
        )}
        {subject.difficulty && (
          <span className={`text-[0.65rem] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full capitalize ${DIFFICULTY_STYLE[subject.difficulty] || 'bg-ink-50 text-ink-500'}`}>
            {subject.difficulty}
          </span>
        )}
        <span className="text-[0.65rem] font-medium text-ink-400">{moduleCount} module{moduleCount !== 1 ? 's' : ''}</span>
        <span className="text-[0.65rem] text-ink-300">&bull;</span>
        <span className="text-[0.65rem] font-medium text-ink-400">{lessonCount} lesson{lessonCount !== 1 ? 's' : ''}</span>
        {estimatedLabel && (
          <>
            <span className="text-[0.65rem] text-ink-300">&bull;</span>
            <span className="text-[0.65rem] font-medium text-ink-400">{estimatedLabel}</span>
          </>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          <div className="w-20"><ProgressBar value={subject.progress_percent ?? 0} color={color} /></div>
          <span className="text-[0.65rem] font-semibold text-ink-600">{subject.progress_percent ?? 0}%</span>
        </div>
      </div>

      {open && (
        <div className="border-t border-ink-100 divide-y divide-ink-50">
          {modules.length ? modules.map((module) => {
            const moduleOpen = openModuleId === module.id;

            return (
              <div key={module.id}>
                <button
                  onClick={() => setOpenModuleId((current) => (current === module.id ? null : module.id))}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-ink-50/60 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink-800 truncate">{module.title}</div>
                    <div className="text-xs text-ink-400">{module.topics_count ?? 0} topics</div>
                  </div>
                  <div className="w-20 flex-shrink-0">
                    <ProgressBar value={module.progress_percent ?? 0} color={color} />
                  </div>
                  <ChevronDown size={14} className={`text-ink-300 transition-transform flex-shrink-0 ${moduleOpen ? 'rotate-180' : ''}`} />
                </button>

                {moduleOpen && (
                  <div className="bg-ink-50/40 px-4 py-2 flex flex-col gap-2">
                    {(module.topics ?? []).map((topic) => (
                      <div key={topic.id} className="pl-2">
                        <div className="flex items-center justify-between gap-2 py-1">
                          <span className="text-xs font-semibold text-ink-600">{topic.title}</span>
                          <span className="text-[0.65rem] text-ink-400">{topic.progress_percent ?? 0}%</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          {(topic.lessons ?? []).map((lesson) => (
                            <button
                              key={lesson.id}
                              onClick={() => onSelectLesson?.(lesson.id)}
                              className="flex items-center gap-2 text-left text-xs text-ink-600 hover:text-primary py-1 pl-1 rounded-md hover:bg-white transition-colors"
                            >
                              {lesson.completed ? (
                                <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />
                              ) : (
                                <Circle size={13} className="text-ink-300 flex-shrink-0" />
                              )}
                              <span className="truncate">{lesson.title}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          }) : (
            <div className="px-4 py-3 text-xs text-ink-400">No modules available for this subject.</div>
          )}
        </div>
      )}
    </Card>
  );
}
