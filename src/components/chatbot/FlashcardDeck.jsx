import { useState } from 'react';
import { ChevronLeft, ChevronRight, Layers, RotateCw } from 'lucide-react';
import Card, { CardHeader } from '../common/Card';
import Button from '../common/Button';

export default function FlashcardDeck({ flashcards }) {
  const cards = flashcards?.cards ?? [];
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  if (!cards.length) {
    return (
      <Card className="max-w-xl">
        <p className="text-sm text-ink-400">AILA couldn't build those flashcards. Try asking again.</p>
      </Card>
    );
  }

  const card = cards[index];

  const go = (delta) => {
    setFlipped(false);
    setIndex((current) => Math.min(Math.max(current + delta, 0), cards.length - 1));
  };

  return (
    <Card className="max-w-xl">
      <CardHeader
        title={`Flashcards: ${flashcards.topic}`}
        subtitle={`Card ${index + 1} of ${cards.length}`}
        action={<Layers size={18} className="text-primary" />}
      />

      <button
        type="button"
        onClick={() => setFlipped((current) => !current)}
        className="w-full min-h-40 rounded-xl border border-ink-100 bg-canvas flex items-center justify-center text-center p-5 hover:border-primary-300 transition-colors"
      >
        <div>
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-ink-400/80 mb-2">
            {flipped ? 'Answer' : 'Question'}
          </p>
          <p className="text-sm font-medium text-ink-800 leading-relaxed">
            {flipped ? card.answer : card.question}
          </p>
          <p className="flex items-center justify-center gap-1 text-[0.65rem] text-ink-400 mt-3">
            <RotateCw size={11} /> Tap to flip
          </p>
        </div>
      </button>

      <div className="flex items-center justify-between mt-4">
        <Button variant="outline" size="sm" icon={<ChevronLeft size={14} />} onClick={() => go(-1)} disabled={index === 0}>
          Prev
        </Button>
        <span className="text-xs text-ink-400">{index + 1} / {cards.length}</span>
        <Button variant="outline" size="sm" icon={<ChevronRight size={14} />} onClick={() => go(1)} disabled={index === cards.length - 1}>
          Next
        </Button>
      </div>
    </Card>
  );
}
