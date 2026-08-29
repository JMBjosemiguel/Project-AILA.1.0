import AilaOrb from '../common/AilaOrb';

export default function SuggestedPrompts({ questions = [], onPick }) {
  return (
    <div className="max-w-xl mx-auto text-center py-8 animate-fadeUp">
      <div className="flex justify-center mb-4">
        <AilaOrb size={52} />
      </div>
      <h2 className="font-display text-xl font-bold text-ink-800 mb-2">How can I help you learn today?</h2>
      <p className="text-sm text-ink-400 mb-6 leading-relaxed">
        Ask about any topic, upload a document, or try one of these to get started.
      </p>
      {questions.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center">
          {questions.map((question) => (
            <button
              key={question.id}
              onClick={() => onPick(question.question_text)}
              className="text-xs sm:text-sm px-3.5 py-2 rounded-full border border-ink-100 bg-white text-ink-600 hover:border-primary-300 hover:text-primary hover:bg-primary-50 transition-colors"
            >
              {question.question_text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
