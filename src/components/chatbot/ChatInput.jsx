import { useRef } from 'react';
import { ArrowUp, ClipboardList, FileText, FolderOpen, Layers, Loader2, Paperclip, Upload, X } from 'lucide-react';
import ActionMenu from '../common/ActionMenu';
import { ACCEPTED_RESOURCE_FILE_TYPES } from '../../constants/ui';

const ATTACH_TRIGGER_CLASSNAME = 'w-8 h-8 flex items-center justify-center rounded-lg text-ink-400 hover:bg-ink-50 hover:text-primary flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300';

export default function ChatInput({
  value, onChange, onSend, disabled,
  attachedResource = null, attachUpload = null, attachError = '',
  onFileSelected, onPickFromLibrary, onRemoveAttachment,
}) {
  const ref = useRef(null);
  const fileInputRef = useRef(null);

  const handleKey = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!disabled) onSend();
    }
  };

  const autoResize = (event) => {
    onChange(event.target.value);
    event.target.style.height = 'auto';
    event.target.style.height = `${Math.min(event.target.scrollHeight, 140)}px`;
  };

  const useTemplate = (template) => {
    onChange(template);
    ref.current?.focus();
  };

  const handleFileInputChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onFileSelected?.(file);
  };

  return (
    <div className="px-4 lg:px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <button
            type="button"
            onClick={() => useTemplate('Generate a 10-item multiple choice quiz about ')}
            className="flex items-center gap-1.5 text-xs font-medium text-ink-500 bg-surface border border-ink-100 rounded-full px-3 py-1.5 hover:border-primary-300 hover:text-primary transition-colors"
          >
            <ClipboardList size={13} /> Generate Quiz
          </button>
          <button
            type="button"
            onClick={() => useTemplate('Generate 10 flashcards about ')}
            className="flex items-center gap-1.5 text-xs font-medium text-ink-500 bg-surface border border-ink-100 rounded-full px-3 py-1.5 hover:border-primary-300 hover:text-primary transition-colors"
          >
            <Layers size={13} /> Flashcards
          </button>
        </div>

        {(attachUpload || attachedResource) && (
          <div className="flex items-center gap-2 mb-2 bg-primary-50/60 border border-primary-100 rounded-xl px-3 py-2 text-xs">
            <FileText size={14} className="text-primary flex-shrink-0" />
            {attachUpload ? (
              <span className="flex-1 min-w-0 truncate text-ink-600">
                Uploading &quot;{attachUpload.fileName}&quot;... {attachUpload.progress}%
              </span>
            ) : (
              <span className="flex-1 min-w-0 truncate text-ink-700 font-medium">{attachedResource.title}</span>
            )}
            <button
              type="button"
              onClick={onRemoveAttachment}
              aria-label="Remove attachment"
              className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full text-ink-400 hover:text-ink-800 hover:bg-ink-100"
            >
              {attachUpload ? <Loader2 size={12} className="animate-spin" /> : <X size={13} />}
            </button>
          </div>
        )}
        {attachError && <p className="text-xs text-rose-600 mb-2">{attachError}</p>}

        <div className="flex items-end gap-2 bg-surface border border-ink-100 focus-within:border-primary-300 rounded-2xl px-3.5 py-2.5 shadow-soft transition-colors">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_RESOURCE_FILE_TYPES.join(',')}
            onChange={handleFileInputChange}
            className="hidden"
          />
          <ActionMenu
            label="Attach a file"
            icon={<Paperclip size={16} />}
            triggerClassName={ATTACH_TRIGGER_CLASSNAME}
            items={[
              { label: 'Upload a file', icon: <Upload size={14} />, onClick: () => fileInputRef.current?.click() },
              { label: 'Choose from Resource Library', icon: <FolderOpen size={14} />, onClick: onPickFromLibrary },
            ]}
          />
          <textarea
            ref={ref}
            rows={1}
            value={value}
            onChange={autoResize}
            onKeyDown={handleKey}
            placeholder="Ask AILA about your coursework..."
            className="flex-1 resize-none bg-transparent outline-none text-sm text-ink-800 placeholder:text-ink-400 py-1.5 max-h-32"
          />
          <button
            onClick={onSend}
            disabled={disabled || !value.trim()}
            aria-label="Send message"
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary text-white disabled:opacity-40 hover:bg-primary-600 transition-colors flex-shrink-0"
          >
            <ArrowUp size={16} />
          </button>
        </div>
        <p className="text-[0.7rem] text-ink-400 text-center mt-2">
          AILA can make mistakes. Review important answers with your course materials.
        </p>
      </div>
    </div>
  );
}
