import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

const components: Components = {
  h1: ({ children }) => <h1 className="mt-6 mb-3 text-xl font-semibold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-5 mb-2 text-lg font-semibold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-4 mb-2 text-base font-semibold first:mt-0">{children}</h3>,
  p: ({ children }) => <p className="my-3 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6">{children}</ol>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-4 border-slate-300 pl-4 text-slate-600">{children}</blockquote>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 underline underline-offset-2 hover:text-blue-800"
    >
      {children}
    </a>
  ),
  code: ({ children, className }) => (
    <code className={className ?? 'rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em]'}>{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-md bg-slate-950 p-4 text-slate-100 [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-slate-300 bg-slate-50 px-3 py-2 font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-slate-300 px-3 py-2 align-top">{children}</td>,
  hr: () => <hr className="my-5 border-slate-200" />,
}

export function normalizeJobDescriptionMarkdown(source: string): string {
  return source
    // Scraped section headings can arrive as ****Heading ****Body when two
    // adjacent bold spans lose their separator. Restore one complete span.
    .replace(/\*{4}([^*\n]+?)\s+\*{4}/g, '\n\n**$1**\n\n')
    // CommonMark does not recognize a closing emphasis marker preceded by a
    // space. Move that space outside without changing the stored source.
    .replace(/\*\*([^*\n]+?)\s+\*\*/g, '**$1** ')
    // A leading ATX heading requires a space and must end before the next
    // concatenated bold section.
    .replace(/^(#{1,6})\s*([^*\n]+?)(?=\s+\*\*)/, '$1 $2\n\n')
    .replace(/^(#{1,6})(?=\S)/gm, '$1 ')
}

export function JobDescriptionMarkdown({ children }: { children: string }) {
  return (
    <div className="break-words text-sm leading-relaxed text-slate-800 [&_input[type=checkbox]]:mr-2">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {normalizeJobDescriptionMarkdown(children)}
      </ReactMarkdown>
    </div>
  )
}
