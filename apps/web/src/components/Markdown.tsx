import ReactMarkdown, { type Components } from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'

// Descriptions are untrusted network content, so raw HTML stays disabled (no rehype-raw).
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
