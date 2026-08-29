import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (!n) return 'Unknown';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-ink-50 last:border-0">
      <span className="text-ink-400 font-medium text-sm">{label}</span>
      <span className="text-ink-800 font-medium text-sm text-right">{value ?? '—'}</span>
    </div>
  );
}

export default function ResourceDetailDialog({ resource, onClose }) {
  return createPortal(
    <div className="fixed inset-0 z-50 bg-ink-900/50 flex items-center justify-center p-4 sm:p-8" role="dialog" aria-modal="true" aria-labelledby="resource-detail-title">
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col bg-white border border-ink-100 rounded-2xl shadow-soft overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 flex-shrink-0 border-b border-ink-100">
          <h3 id="resource-detail-title" className="text-[0.95rem] font-semibold text-ink-800 truncate pr-4">{resource.title}</h3>
          <button onClick={onClose} aria-label="Close dialog" className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full text-ink-400 hover:text-ink-800 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-ink-400 mb-2">Metadata</div>
            <Row label="Owner" value={resource.first_name ? `${resource.first_name} ${resource.last_name}` : 'Unknown'} />
            <Row label="Type" value={resource.type?.toUpperCase()} />
            <Row label="File size" value={formatBytes(resource.file_size_bytes)} />
            <Row label="Uploaded" value={new Date(resource.created_at).toLocaleString()} />
            <Row label="Associated course" value={resource.course_name} />
            <Row label="Usage count" value={resource.view_count} />
            <Row label="Last accessed" value={resource.last_accessed_at ? new Date(resource.last_accessed_at).toLocaleString() : 'Never'} />
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-ink-400 mb-2">AI Analysis</div>
            {resource.ai_analyzed_at ? (
              <div className="flex flex-col gap-2.5">
                <p className="text-sm text-ink-600 leading-relaxed">{resource.ai_summary || 'No summary available.'}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {resource.ai_topic && <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-full bg-primary-50 text-primary">{resource.ai_topic}</span>}
                  {resource.ai_difficulty && <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-full capitalize bg-ink-50 text-ink-500">{resource.ai_difficulty}</span>}
                </div>
                {resource.ai_keywords?.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap">
                    {resource.ai_keywords.map((keyword) => (
                      <span key={keyword} className="text-[0.7rem] font-medium px-2 py-0.5 rounded-full bg-ink-50 text-ink-500">{keyword}</span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-ink-400">This file hasn't been analyzed by AILA yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
