import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import Button from '../common/Button';
import { updateAnnouncement } from '../../services/api/adminService';
import { useToast } from '../common/Toast';

export default function AnnouncementEditDialog({ announcement, onClose, onSaved }) {
  const [title, setTitle] = useState(announcement.title);
  const [body, setBody] = useState(announcement.body);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const handleSave = async () => {
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    try {
      await updateAnnouncement(announcement.id, { title: title.trim(), body: body.trim() });
      toast.success('Announcement updated.');
      onSaved();
    } catch (error) {
      toast.error(error.message || 'Could not update that announcement.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 bg-ink-900/50 flex items-center justify-center p-4 sm:p-8" role="dialog" aria-modal="true" aria-labelledby="announcement-edit-title">
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col bg-white border border-ink-100 rounded-2xl shadow-soft overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 flex-shrink-0 border-b border-ink-100">
          <h3 id="announcement-edit-title" className="text-[0.95rem] font-semibold text-ink-800">Edit announcement</h3>
          <button onClick={onClose} aria-label="Close dialog" className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full text-ink-400 hover:text-ink-800 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Title"
            className="border border-ink-100 focus:border-primary-300 rounded-lg px-3 py-2 text-sm outline-none"
          />
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Message"
            rows={5}
            className="border border-ink-100 focus:border-primary-300 rounded-lg px-3 py-2 text-sm outline-none resize-none"
          />
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
