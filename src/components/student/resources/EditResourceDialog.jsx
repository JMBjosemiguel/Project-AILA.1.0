import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import Button from '../../common/Button';
import { useToast } from '../../common/Toast';
import { updateResource } from '../../../services/api/resourceService';

export default function EditResourceDialog({ file, subjects, onClose, onSaved }) {
  const [title, setTitle] = useState(file.title);
  const [subjectId, setSubjectId] = useState(file.subjects?.[0]?.id ? String(file.subjects[0].id) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Title cannot be empty.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateResource(file.id, { title: title.trim(), subjectId: subjectId ? Number(subjectId) : null });
      toast.success('Resource updated.');
      onSaved?.();
    } catch (err) {
      setError(err.message || 'Could not update this resource.');
      toast.error(err.message || 'Could not update this resource.');
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 bg-ink-900/50 flex items-center justify-center p-4 sm:p-8" role="dialog" aria-modal="true" aria-labelledby="edit-resource-title">
      <div className="w-full max-w-md max-h-[90vh] flex flex-col bg-white border border-ink-100 rounded-2xl shadow-soft overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 flex-shrink-0 border-b border-ink-100">
          <h3 id="edit-resource-title" className="text-[0.95rem] font-semibold text-ink-800">Edit resource</h3>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full text-ink-400 hover:text-ink-800 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && <p className="text-xs text-rose-600 mb-3">{error}</p>}
          <div className="flex flex-col gap-4">
            <div>
              <label htmlFor="resource-title" className="text-xs font-semibold text-ink-600 mb-1.5 block">Title</label>
              <input
                id="resource-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full border border-ink-100 focus:border-primary-300 rounded-lg px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-200"
              />
            </div>
            <div>
              <label htmlFor="resource-subject" className="text-xs font-semibold text-ink-600 mb-1.5 block">Course</label>
              <select
                id="resource-subject"
                value={subjectId}
                onChange={(event) => setSubjectId(event.target.value)}
                className="w-full border border-ink-100 focus:border-primary-300 rounded-lg px-3 py-2 text-sm outline-none bg-white focus-visible:ring-2 focus-visible:ring-primary-200"
              >
                <option value="">Unassigned</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>{subject.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 border-t border-ink-100 px-5 py-4 flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving} icon={saving ? <Loader2 size={14} className="animate-spin" /> : undefined}>
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
