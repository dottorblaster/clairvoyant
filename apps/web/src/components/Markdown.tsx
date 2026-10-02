import ReactMarkdown, { type Components } from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'

/**
 * Markdown rendering for user-authored prose (event descriptions).
 *
 * Descriptions are untrusted network content, so raw HTML is deliberately NOT
 * enabled (`rehype-raw` is not installed): the default pipeline treats HTML as
 * text, and `skipHtml` drops the stray `<oembed>`/`<u>` tags that show up in the
 * live data so they cannot clutter the prose. Links open in a new tab without
 * passing a referrer or ranking signals; images load lazily.
 *
 * The panel title is the page's `<h1>`, so Markdown headings are shifted down a
 * level to keep the document outline meaningful.
 */
const components: Components = {
  h1: ({ node, ...props }) => <h2 {...props} />,
  h2: ({ node, ...props }) => <h3 {...props} />,
  h3: ({ node, ...props }) => <h4 {...props} />,
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer nofollow" />,
  img: ({ node, ...props }) => (
    <img
      {...props}
      alt={props.alt ?? ''}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
    />
  ),
}

export interface MarkdownProps {
  children: string
}

export const Markdown = ({ children }: MarkdownProps) => (
  <div className="markdown">
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components} skipHtml>
      {children}
    </ReactMarkdown>
  </div>
)
