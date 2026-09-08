import { useEffect, useState } from 'react';
import { BookOpen, ClipboardList, Copy, GraduationCap, Loader2, LogIn, Sparkles } from 'lucide-react';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import EmptyState from '../../components/common/EmptyState';
import MarkdownRenderer from '../../components/chatbot/MarkdownRenderer';
import { useToast } from '../../components/common/Toast';
import { viewSharedMaterial, copySharedMaterial } from '../../services/api/shareService';

const DIFFICULTY_LABEL = {
  beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced',
  easy: 'Beginner', medium: 'Intermediate', hard: 'Advanced',
};

function SharedCourse({ data }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-wide text-primary mb-1">
          <BookOpen size={12} /> Shared course
        </div>
        <h1 className="text-xl font-display font-semibold text-ink-800">{data.title}</h1>
        <p className="text-sm text-ink-500 mt-1">
          {DIFFICULTY_LABEL[data.difficulty] || data.difficulty}
          {data.goal ? ` · Goal: ${data.goal}` : ''} · {data.moduleCount} modules · {data.lessonCount} lessons
        </p>
        {data.hasAssessments && (
          <p className="text-xs text-ink-400 mt-1 inline-flex items-center gap-1">
            <GraduationCap size={12} /> This course has checkpoint assessments. Copy it to take your own.
          </p>
        )}
      </div>

      {data.modules.map((module_, mi) => (
        <Card key={mi}>
          <h2 className="text-sm font-semibold text-ink-800 mb-3">Module {mi + 1}: {module_.title}</h2>
          <div className="flex flex-col gap-4">
            {module_.topics.map((topic, ti) => (
              <div key={ti}>
                <h3 className="text-xs font-bold uppercase tracking-wide text-ink-400 mb-2">{topic.title}</h3>
                {topic.lessons.map((lesson, li) => (
                  <div key={li} className="mb-3">
                    <p className="text-sm font-semibold text-ink-700 mb-1">{lesson.title}</p>
                    {lesson.content && <MarkdownRenderer text={lesson.content} />}
                  </div>
                ))}
                {topic.keyTerms.length > 0 && (
                  <div className="text-xs text-ink-500 mt-1">
                    {topic.keyTerms.map((kt, ki) => (
                      <div key={ki}><span className="font-semibold text-ink-700">{kt.term}:</span> {kt.definition}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function SharedQuiz({ data }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-wide text-primary mb-1">
          <ClipboardList size={12} /> Shared quiz
        </div>
        <h1 className="text-xl font-display font-semibold text-ink-800">{data.topic}</h1>
        <p className="text-sm text-ink-500 mt-1">
          {DIFFICULTY_LABEL[data.difficulty] || data.difficulty} · {data.questionCount} questions
        </p>
        <p className="text-xs text-ink-400 mt-1">Copy this quiz to your materials to take it and get graded.</p>
      </div>
      <Card>
        <div className="flex flex-col gap-4">
          {data.items.map((item, i) => (
            <div key={i} className="border border-ink-100 rounded-xl p-3.5">
              <p className="text-sm font-medium text-ink-800 mb-2">{i + 1}. {item.question}</p>
              {item.options?.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                  {item.options.map((opt, oi) => (
                    <li key={oi} className="text-sm text-ink-500 px-3 py-1.5 rounded-lg border border-ink-100">{opt}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export default function SharedMaterialPage({ token, isAuthenticated, onNavigate, onGoToLogin }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [copying, setCopying] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let active = true;
    setState({ loading: true, error: null, data: null });
    viewSharedMaterial(token)
      .then((data) => { if (active) setState({ loading: false, error: null, data }); })
      .catch((err) => { if (active) setState({ loading: false, error: err, data: null }); });
    return () => { active = false; };
  }, [token]);

  const handleCopy = async () => {
    setCopying(true);
    try {
      const result = await copySharedMaterial(token);
      toast.success(`Added to your materials${result.materialType === 'subject' ? ' — open Learning Hub' : ''}.`);
      onNavigate?.(result.materialType === 'subject' ? 'hub' : 'hub');
    } catch (err) {
      toast.error(err.message || 'Could not copy this material.');
    } finally {
      setCopying(false);
    }
  };

  const { loading, error, data } = state;

  return (
    <div className="min-h-screen bg-ink-50/40">
      <header className="bg-white border-b border-ink-100 px-5 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-2 text-sm font-display font-semibold text-ink-800">
          <Sparkles size={16} className="text-primary" /> AILA · Shared learning material
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-8">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-ink-400 py-16 justify-center">
            <Loader2 size={16} className="animate-spin" /> Loading shared material…
          </div>
        )}

        {!loading && error && (
          <Card>
            <EmptyState title="This shared material is no longer available" message="The link may have been revoked, or the material was removed." />
          </Card>
        )}

        {!loading && data && (
          <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-ink-400">Shared by {data.sharedBy} · read-only</p>
              {isAuthenticated ? (
                <Button size="sm" disabled={copying} icon={copying ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />} onClick={handleCopy}>
                  Copy to my materials
                </Button>
              ) : (
                <Button size="sm" variant="outline" icon={<LogIn size={14} />} onClick={onGoToLogin}>
                  Log in to copy
                </Button>
              )}
            </div>
            {data.shareType === 'subject' ? <SharedCourse data={data} /> : <SharedQuiz data={data} />}
          </>
        )}
      </main>
    </div>
  );
}
