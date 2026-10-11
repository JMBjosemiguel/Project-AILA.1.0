import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, Loader2, X } from 'lucide-react';
import Button from '../../common/Button';
import { useToast } from '../../common/Toast';
import { COURSE_FOCUSES, COURSE_LENGTHS, COURSE_PURPOSES } from '../../../constants/ui';
import { generateCourse } from '../../../services/api/learningService';

const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];

function pillClass(active) {
  return [
    'text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300',
    active ? 'bg-primary border-primary text-white' : 'bg-surface border-ink-100 text-ink-600 hover:border-primary-300',
  ].join(' ');
}

export default function AddCourseWizard({ onClose, onGenerated }) {
  const [courseName, setCourseName] = useState('');
  const [purpose, setPurpose] = useState('from_scratch');
  const [difficulty, setDifficulty] = useState('beginner');
  const [length, setLength] = useState('standard');
  const [focus, setFocus] = useState([]);
  const [goal, setGoal] = useState('');
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submittingRef = useRef(false);
  const toast = useToast();

  const toggleFocus = (value) => {
    setFocus((current) => (current.includes(value) ? current.filter((v) => v !== value) : [...current, value]));
  };

  const handleGenerate = async () => {
    if (submittingRef.current) return;
    if (!courseName.trim()) {
      setError('Please fill in the course name.');
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setError('');
    try {
      const result = await generateCourse({
        courseName: courseName.trim(), difficulty, goal: goal.trim(), purpose, length, focus,
      });
      toast.success(
        result.personalizationLevel === 'performance_aware'
          ? 'Course generated. AILA tuned the roadmap to your recent progress.'
          : 'Course generated. AILA built your roadmap.'
      );
      onGenerated?.(result.subjectId);
    } catch (err) {
      setError(err.message || 'Could not generate that course right now.');
      toast.error(err.message || 'Could not generate that course right now.');
      setLoading(false);
      submittingRef.current = false;
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-ink-900/50 flex items-center justify-center p-4 sm:p-8" role="dialog" aria-modal="true" aria-labelledby="add-course-title">
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col bg-surface border border-ink-100 rounded-2xl shadow-soft overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 flex-shrink-0 border-b border-ink-100">
          <div>
            <h3 id="add-course-title" className="text-[0.95rem] font-semibold text-ink-800">Add a course</h3>
            <p className="text-xs text-ink-400 mt-0.5">Tell AILA what you're studying and it will build a personalized roadmap.</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full text-ink-400 hover:text-ink-800 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
          >
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center gap-2 text-sm text-ink-400 py-14 justify-center">
            <Loader2 size={20} className="animate-spin" />
            <span>AILA is building your course roadmap...</span>
            <span className="text-xs text-ink-400">This can take up to a minute.</span>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {error && <p className="text-xs text-rose-600 mb-3">{error}</p>}
              <div className="flex flex-col gap-4">
                <div>
                  <label htmlFor="course-name" className="text-xs font-semibold text-ink-600 mb-1.5 block">Course name</label>
                  <input
                    id="course-name"
                    value={courseName}
                    onChange={(event) => setCourseName(event.target.value)}
                    placeholder="e.g. Introduction to Psychology, Organic Chemistry, Business Finance..."
                    className="w-full border border-ink-100 focus:border-primary-300 rounded-lg px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-200"
                  />
                </div>

                <div>
                  <span className="text-xs font-semibold text-ink-600 mb-1.5 block">What's this course for?</span>
                  <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="What's this course for?">
                    {COURSE_PURPOSES.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setPurpose(option.value)}
                        role="radio"
                        aria-checked={purpose === option.value}
                        className={pillClass(purpose === option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowMoreOptions((current) => !current)}
                  aria-expanded={showMoreOptions}
                  className="self-start flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-600"
                >
                  {showMoreOptions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  More options
                </button>

                {showMoreOptions && (
                  <div className="flex flex-col gap-4 -mt-1">
                    <div>
                      <span className="text-xs font-semibold text-ink-600 mb-1.5 block">Difficulty</span>
                      <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Difficulty">
                        {DIFFICULTIES.map((option) => (
                          <button
                            key={option}
                            onClick={() => setDifficulty(option)}
                            role="radio"
                            aria-checked={difficulty === option}
                            className={pillClass(difficulty === option)}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-xs font-semibold text-ink-600 mb-1.5 block">Course length</span>
                      <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Course length">
                        {COURSE_LENGTHS.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => setLength(option.value)}
                            role="radio"
                            aria-checked={length === option.value}
                            title={option.description}
                            className={pillClass(length === option.value)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-xs font-semibold text-ink-600 mb-1.5 block">Focus on</span>
                      <div className="flex gap-2 flex-wrap" role="group" aria-label="Focus on">
                        {COURSE_FOCUSES.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => toggleFocus(option.value)}
                            aria-pressed={focus.includes(option.value)}
                            className={pillClass(focus.includes(option.value))}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label htmlFor="course-goal" className="text-xs font-semibold text-ink-600 mb-1.5 block">Learning goal (optional)</label>
                      <input
                        id="course-goal"
                        value={goal}
                        onChange={(event) => setGoal(event.target.value)}
                        placeholder="e.g. Prepare for midterm, Understand the basics, Master the topic..."
                        className="w-full border border-ink-100 focus:border-primary-300 rounded-lg px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-200"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-shrink-0 border-t border-ink-100 px-5 py-4">
              <Button full onClick={handleGenerate}>Generate course</Button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
