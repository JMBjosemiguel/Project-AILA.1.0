import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';

const components = {
  h1: ({ children }) => <h1 className="font-display font-semibold text-lg text-ink-800 mt-3 mb-1.5 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="font-display font-semibold text-base text-ink-800 mt-3 mb-1.5 first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="font-display font-semibold text-sm text-ink-800 mt-2.5 mb-1 first:mt-0">{children}</h3>,
  p: ({ children }) => <p className="leading-relaxed mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 mb-2">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 mb-2">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  code: ({ inline, className, children, ...props }) =>
    inline ? (
      <code className="bg-ink-50 text-primary px-1.5 py-0.5 rounded text-[0.85em] font-mono" {...props}>
        {children}
      </code>
    ) : (
      <code className={className} {...props}>
        {children}
      </code>
    ),
  pre: ({ children }) => (
    <pre className="bg-ink-900 text-ink-50 rounded-xl p-3 overflow-x-auto text-[0.8rem] font-mono mb-2">{children}</pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-primary/40 pl-3 italic text-ink-500 mb-2">{children}</blockquote>
  ),
  hr: () => <hr className="border-ink-100 my-3" />,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-2">
      <table className="border-collapse text-sm w-full">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-ink-100 px-2.5 py-1.5 bg-ink-50 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-ink-100 px-2.5 py-1.5">{children}</td>,
};

export default function MarkdownRenderer({ text }) {
  return (
    <div className="text-[0.9rem]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
