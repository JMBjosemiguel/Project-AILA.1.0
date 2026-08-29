import { useEffect, useState } from 'react';
import { MessageSquareText, Trash2 } from 'lucide-react';
import Button from '../../../components/common/Button';
import Card, { CardHeader } from '../../../components/common/Card';
import EmptyState from '../../../components/common/EmptyState';
import ProgressBar from '../../../components/common/ProgressBar';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { useToast } from '../../../components/common/Toast';
import StarRating from '../../../components/student/feedback/StarRating';
import { useFeedbackData } from '../../../hooks/useFeedbackData';
import { deleteFeedback, getMyFeedback, submitFeedback } from '../../../services/api/feedbackService';

export default function FeedbackPage() {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const { data } = useFeedbackData(refreshVersion);
  const [overall, setOverall] = useState(0);
  const [contextType, setContextType] = useState('');
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [mine, setMine] = useState([]);
  const confirm = useConfirm();
  const toast = useToast();

  useEffect(() => {
    getMyFeedback().then((result) => setMine(result.feedback ?? [])).catch(() => {});
  }, [refreshVersion]);

  const submit = async () => {
    if (!overall) return;
    try {
      await submitFeedback({
        rating: overall,
        context_type: contextType || null,
        context_id: null,
        comment,
      });
      setSubmitted(true);
      setOverall(0);
      setContextType('');
      setComment('');
      setRefreshVersion((version) => version + 1);
      toast.success('Feedback submitted. Thank you!');
      setTimeout(() => setSubmitted(false), 3000);
    } catch (error) {
      toast.error(error.message || 'Could not submit your feedback.');
    }
  };

  const handleDelete = async (entry) => {
    const ok = await confirm({
      title: 'Delete this feedback?',
      message: 'This submission will be permanently removed.',
    });
    if (!ok) return;

    try {
      await deleteFeedback(entry.id);
      toast.success('Feedback deleted.');
      setRefreshVersion((version) => version + 1);
    } catch (error) {
      toast.error(error.message || 'Could not delete that feedback.');
    }
  };

  return (
    <div className="p-5 lg:p-8 max-w-5xl mx-auto animate-fadeUp">
      <div className="grid lg:grid-cols-[1fr_300px] gap-5 items-start">
        <div className="flex flex-col gap-5">
          <Card className="flex flex-col gap-6">
            <CardHeader title="Rate your experience" />

            <Field label="Overall satisfaction with AILA">
              <StarRating value={overall} onChange={setOverall} />
            </Field>

            <Field label="Feedback context">
              <select
                value={contextType}
                onChange={(event) => setContextType(event.target.value)}
                className="w-full border border-ink-100 focus:border-primary-300 rounded-xl px-3.5 py-2 text-sm outline-none bg-white"
              >
                <option value="">General</option>
                {(data?.contexts ?? []).map((context) => (
                  <option key={context} value={context}>{context}</option>
                ))}
              </select>
            </Field>

            <Field label="Share your thoughts">
              <textarea
                rows={4}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Tell us what you liked, what could be better, or any bugs you ran into..."
                className="w-full border border-ink-100 focus:border-primary-300 rounded-xl p-3 text-sm outline-none resize-y"
              />
            </Field>

            <Button onClick={submit} className="self-start">
              {submitted ? 'Thank you' : 'Submit feedback'}
            </Button>
          </Card>

          <Card>
            <CardHeader title="Your feedback" subtitle="Submissions you've sent, most recent first." />
            {mine.length ? (
              <div className="flex flex-col divide-y divide-ink-50">
                {mine.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StarRating value={entry.rating} readOnly size={13} />
                        {entry.context_type && (
                          <span className="text-[0.65rem] font-semibold px-2 py-0.5 rounded-full bg-ink-50 text-ink-500 capitalize">{entry.context_type.replace('_', ' ')}</span>
                        )}
                      </div>
                      {entry.comment && <p className="text-sm text-ink-600 mt-1.5">{entry.comment}</p>}
                      <span className="text-xs text-ink-300 mt-1 block">{new Date(entry.created_at).toLocaleString()}</span>
                    </div>
                    <button
                      onClick={() => handleDelete(entry)}
                      aria-label="Delete feedback"
                      className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg text-ink-300 hover:text-rose-600 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={MessageSquareText} title="No submissions yet" message="Feedback you send will show up here." />
            )}
          </Card>
        </div>

        <Card>
          <CardHeader title="Satisfaction summary" />
          {data?.averageRating ? (
            <>
              <div className="text-center py-2 mb-3">
                <span className="text-4xl font-display font-extrabold text-ink-800">{data.averageRating}</span>
                <span className="text-lg text-ink-400"> / 5.0</span>
              </div>
              <div className="flex flex-col gap-2 mb-4">
                {data.distribution.map((bar) => (
                  <div key={bar.label} className="flex items-center gap-2 text-xs text-ink-400">
                    <span className="w-6 flex-shrink-0">{bar.label}</span>
                    <ProgressBar value={bar.pct} color={bar.color} className="flex-1" height={6} />
                    <span className="w-8 text-right flex-shrink-0">{bar.pct}%</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-ink-400 text-center leading-relaxed">
                Based on {data.totalResponses} responses.
              </p>
            </>
          ) : (
            <EmptyState title="No feedback yet" message="Be the first to share your thoughts on AILA." />
          )}
        </Card>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-semibold text-ink-800">{label}</label>
      {children}
    </div>
  );
}
