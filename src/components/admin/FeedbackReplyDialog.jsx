import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Star, X } from 'lucide-react';
import Button from '../common/Button';
import { updateAdminFeedback } from '../../services/api/adminService';
import { useToast } from '../common/Toast';

export default function FeedbackReplyDialog({ feedback, onClose, onSaved }) {
  const [adminNotes, setAdminNotes] = useState(feedback.admin_notes || '');
  const [status, setStatus] = useState(feedback.status || 'pending');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAdminFeedback(feedback.id, { adminNotes, status });
      toast.success('Feedback updated.');
      onSaved();
    } catch (error) {
      toast.error(error.message || 'Could not update feedback.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 bg-ink-900/50 flex items-center justify-center p-4 sm:p-8" role="dialog" aria-modal="true" aria-labelledby="feedback-reply-title">
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col bg-white border border-ink-100 rounded-2xl shadow-soft overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 flex-shrink-0 border-b border-ink-100">
          <div>
            <h3 id="feedback-reply-title" className="text-[0.95rem] font-semibold text-ink-800">{feedback.first_name} {feedback.last_name}</h3>
            <div className="flex items-center gap-0.5 mt-1">
              {Array.from({ length: 5 }).map((_, index) => (
                <Star key={index} size={13} className={index < feedback.rating ? 'text-amber-400 fill-amber-400' : 'text-ink-200'} />
              ))}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close dialog" className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full text-ink-400 hover:text-ink-800 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-ink-400 mb-1.5">Comment</div>
            <p className="text-sm text-ink-600 leading-relaxed">{feedback.comment || 'No comment left.'}</p>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-ink-400 mb-1.5">Status</div>
            <div className="flex gap-2">
              <button
                onClick={() => setStatus('pending')}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${status === 'pending' ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-ink-100 text-ink-600'}`}
              >
                Pending
              </button>
              <button
                onClick={() => setStatus('resolved')}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${status === 'resolved' ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-ink-100 text-ink-600'}`}
              >
                Resolved
              </button>
            </div>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-ink-400 mb-1.5">Admin reply / notes</div>
            <textarea
              value={adminNotes}
              onChange={(event) => setAdminNotes(event.target.value)}
              rows={4}
              placeholder="Add an internal note or reply for this feedback..."
              className="w-full text-sm border border-ink-100 rounded-xl px-3 py-2.5 outline-none focus:border-primary-300 resize-none"
            />
          </div>
        </div>

        <div className="flex-shrink-0 flex items-center justify-end gap-2 px-5 py-4 border-t border-ink-100">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
