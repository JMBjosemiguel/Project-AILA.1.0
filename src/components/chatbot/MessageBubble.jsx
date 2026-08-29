import { useState } from 'react';
import { Check, Copy, RotateCcw } from 'lucide-react';
import AilaOrb from '../common/AilaOrb';
import MarkdownRenderer from './MarkdownRenderer';
import QuizCard from './QuizCard';
import FlashcardDeck from './FlashcardDeck';

export default function MessageBubble({
  role,
  text,
  type = 'text',
  data = null,
  avatarLetter = 'A',
  isLast = false,
  onRegenerate,
  regenerateDisabled = false,
}) {
  const isUser = role === 'user';
  const isRichContent = !isUser && (type === 'quiz' || type === 'flashcards');
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard access denied — nothing meaningful to recover here
    }
  };

  return (
    <div className={`flex flex-col ${isRichContent ? 'max-w-full' : 'max-w-2xl'} ${isUser ? 'items-end ml-auto' : 'items-start'}`}>
      <div className={`flex gap-2.5 w-full ${isUser ? 'flex-row-reverse' : ''}`}>
        {isUser ? (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-ink-800 to-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {avatarLetter}
          </div>
        ) : (
          <AilaOrb size={30} />
        )}

        {isRichContent ? (
          <div className="flex-1 min-w-0">
            {type === 'quiz' && <QuizCard quiz={data} />}
            {type === 'flashcards' && <FlashcardDeck flashcards={data} />}
          </div>
        ) : (
          <div
            className={[
              'px-4 py-3 rounded-2xl leading-relaxed',
              isUser
                ? 'bg-primary text-white rounded-tr-sm text-[0.9rem] whitespace-pre-wrap'
                : 'bg-white border border-ink-100 text-ink-800 rounded-tl-sm',
            ].join(' ')}
          >
            {isUser ? text : <MarkdownRenderer text={text} />}
          </div>
        )}
      </div>

      {!isUser && type === 'text' && (
        <div className="flex items-center gap-1 mt-1 ml-[2.6rem]">
          <button
            onClick={handleCopy}
            title="Copy response"
            className="w-6 h-6 flex items-center justify-center rounded text-ink-400 hover:text-primary hover:bg-ink-50 transition-colors"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
          {isLast && (
            <button
              onClick={onRegenerate}
              disabled={regenerateDisabled}
              title="Regenerate response"
              className="w-6 h-6 flex items-center justify-center rounded text-ink-400 hover:text-primary hover:bg-ink-50 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              <RotateCcw size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function TypingBubble() {
  return (
    <div className="flex gap-2.5 max-w-2xl">
      <AilaOrb size={30} />
      <div className="flex items-center gap-2 px-4 py-3.5 rounded-2xl rounded-tl-sm bg-white border border-ink-100">
        <span className="text-xs text-ink-400 font-medium">AILA is thinking...</span>
        <span className="flex items-center gap-1">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="w-1.5 h-1.5 rounded-full bg-ink-300 animate-bounce"
              style={{ animationDelay: `${index * 0.15}s` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
