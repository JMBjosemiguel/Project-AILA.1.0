import { useRef } from 'react';
import { ArrowUp, ClipboardList, Layers, Paperclip } from 'lucide-react';

export default function ChatInput({ value, onChange, onSend, disabled }) {
  const ref = useRef(null);

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

  return (
    <div className="px-4 lg:px-6 pb-5 pt-2">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-2">
          <button
            type="button"
            onClick={() => useTemplate('Generate a 10-item multiple choice quiz about ')}
            className="flex items-center gap-1.5 text-xs font-medium text-ink-500 bg-white border border-ink-100 rounded-full px-3 py-1.5 hover:border-primary-300 hover:text-primary transition-colors"
          >
            <ClipboardList size={13} /> Generate Quiz
          </button>
          <button
            type="button"
            onClick={() => useTemplate('Generate 10 flashcards about ')}
            className="flex items-center gap-1.5 text-xs font-medium text-ink-500 bg-white border border-ink-100 rounded-full px-3 py-1.5 hover:border-primary-300 hover:text-primary transition-colors"
          >
            <Layers size={13} /> Flashcards
          </button>
        </div>
        <div className="flex items-end gap-2 bg-white border border-ink-100 focus-within:border-primary-300 rounded-2xl px-3.5 py-2.5 shadow-soft transition-colors">
          <button className="w-8 h-8 flex items-center justify-center rounded-lg text-ink-400 hover:bg-ink-50 hover:text-primary flex-shrink-0">
            <Paperclip size={16} />
          </button>
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
