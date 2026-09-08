import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Link2, Loader2, Lock, X } from 'lucide-react';
import Button from './Button';
import { useToast } from './Toast';
import { getShareStatus, createShare, revokeShare, absoluteShareUrl } from '../../services/api/shareService';

// Small modal to make one generated material shareable via an unlisted link.
// Private by default; the link is read-only and revocable.
export default function ShareDialog({ materialType, materialId, materialName, onClose }) {
  const [status, setStatus] = useState(null); // { visibility, shared, createdAt, tokenHint }
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [freshUrl, setFreshUrl] = useState(null); // only available right after create
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let active = true;
    getShareStatus(materialType, materialId)
      .then((data) => { if (active) setStatus(data); })
      .catch((err) => { if (active) toast.error(err.message || 'Could not load sharing status.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [materialType, materialId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    setBusy(true);
    try {
      const data = await createShare(materialType, materialId);
      setFreshUrl(absoluteShareUrl(data.sharePath));
      setStatus({ visibility: 'unlisted', shared: true, createdAt: data.createdAt, tokenHint: data.token.slice(0, 8) });
      setCopied(false);
    } catch (err) {
      toast.error(err.message || 'Could not create a share link.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    setBusy(true);
    try {
      await revokeShare(materialType, materialId);
      setStatus({ visibility: 'private', shared: false });
      setFreshUrl(null);
    } catch (err) {
      toast.error(err.message || 'Could not revoke the share link.');
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!freshUrl) return;
    try {
      await navigator.clipboard.writeText(freshUrl);
      setCopied(true);
      toast.success('Link copied.');
    } catch {
      toast.error('Could not copy — select and copy the link manually.');
    }
  };

  const isShared = status?.shared;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-ink-900/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="share-dialog-title">
      <div className="w-full max-w-md bg-white border border-ink-100 rounded-2xl shadow-soft overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-ink-100">
          <div className="min-w-0">
            <h3 id="share-dialog-title" className="text-[0.95rem] font-semibold text-ink-800">Share this {materialType === 'subject' ? 'course' : 'quiz'}</h3>
            <p className="text-xs text-ink-400 mt-0.5 truncate">{materialName}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full text-ink-400 hover:text-ink-800 hover:bg-ink-50">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-ink-400 py-6 justify-center">
              <Loader2 size={15} className="animate-spin" /> Loading…
            </div>
          ) : !isShared ? (
            <>
              <div className="flex items-center gap-2 text-sm text-ink-600 mb-3">
                <Lock size={14} className="text-ink-400" /> This material is <span className="font-semibold">private</span>.
              </div>
              <p className="text-xs text-ink-400 mb-4">
                Create an unlisted link. Anyone with the link can view a read-only copy — no scores, no answer keys, no personal data. You can revoke it any time.
              </p>
              <Button full disabled={busy} icon={busy ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} onClick={handleCreate}>
                Create share link
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-ink-700 mb-3">
                <Link2 size={14} className="text-primary" /> Shared via an <span className="font-semibold">unlisted link</span>.
              </div>
              {freshUrl ? (
                <div className="flex items-center gap-2 mb-3">
                  <input
                    readOnly
                    value={freshUrl}
                    onFocus={(e) => e.target.select()}
                    className="flex-1 min-w-0 text-xs border border-ink-100 rounded-lg px-2.5 py-2 bg-ink-50 text-ink-600"
                    aria-label="Share link"
                  />
                  <Button size="sm" variant="outline" icon={copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />} onClick={handleCopy}>
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-ink-400 mb-3">
                  A link is active (ends <span className="font-mono">…{status.tokenHint}</span>). For security the full link is only shown once — create a new one to get a copyable link.
                </p>
              )}
              <div className="flex gap-2">
                {!freshUrl && (
                  <Button size="sm" variant="outline" disabled={busy} icon={<Link2 size={13} />} onClick={handleCreate}>New link</Button>
                )}
                <Button size="sm" variant="outline" disabled={busy} onClick={handleRevoke} className="!text-rose-600 !border-rose-200 hover:!bg-rose-50">
                  Revoke link
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
