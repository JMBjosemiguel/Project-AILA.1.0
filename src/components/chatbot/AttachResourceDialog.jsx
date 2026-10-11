import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Loader2, Search, X } from 'lucide-react';
import { getResourceLibraryData } from '../../services/api/resourceService';

// Small "Choose from Resource Library" picker for the chat paperclip menu —
// reuses the same search endpoint as the Resource Library page / Learning
// Hub search, just scoped to a pick-one-row flow instead of full management.
export default function AttachResourceDialog({ onPick, onClose }) {
  const [search, setSearch] = useState('');
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const timer = setTimeout(() => {
      getResourceLibraryData({ search })
        .then((data) => { if (active) setResources(data?.resources ?? []); })
        .catch((err) => { if (active) setError(err.message || 'Could not load your resources.'); })
        .finally(() => { if (active) setLoading(false); });
    }, search ? 250 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [search]);

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-ink-900/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="attach-resource-title">
      <div className="w-full max-w-md max-h-[80vh] flex flex-col bg-surface border border-ink-100 rounded-2xl shadow-soft overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 flex-shrink-0 border-b border-ink-100">
          <h3 id="attach-resource-title" className="text-[0.95rem] font-semibold text-ink-800">Choose from Resource Library</h3>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full text-ink-400 hover:text-ink-800 hover:bg-ink-50">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pt-3 flex-shrink-0">
          <div className="flex items-center gap-2 bg-ink-50 border border-ink-100 focus-within:border-primary-300 focus-within:bg-surface rounded-xl px-3 py-2 transition-colors">
            <Search size={15} className="text-ink-400 flex-shrink-0" />
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search your resources..."
              aria-label="Search your resources"
              className="flex-1 outline-none text-sm bg-transparent placeholder:text-ink-400"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-ink-400 py-6 justify-center">
              <Loader2 size={15} className="animate-spin" /> Loading…
            </div>
          ) : error ? (
            <p className="text-sm text-rose-600 py-4 text-center">{error}</p>
          ) : resources.length === 0 ? (
            <p className="text-sm text-ink-400 py-6 text-center">No resources found.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {resources.map((resource) => (
                <button
                  key={resource.id}
                  type="button"
                  onClick={() => onPick({ id: resource.id, title: resource.title, type: resource.type })}
                  className="w-full flex items-center gap-3 border border-ink-100 hover:border-primary-200 rounded-xl px-3 py-2.5 text-left transition-colors"
                >
                  <span className="w-8 h-8 rounded-lg bg-ink-50 text-ink-400 flex items-center justify-center flex-shrink-0">
                    <FileText size={15} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink-800 truncate">{resource.title}</span>
                    <span className="block text-xs text-ink-400 truncate capitalize">{resource.type}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
