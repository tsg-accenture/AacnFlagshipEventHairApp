import { Fragment, type ReactNode } from 'react'

/** Renders the library's small Markdown subset (## headings, paragraphs, - lists) as React text. No raw HTML. */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let list: string[] = []
  let para: string[] = []
  const flushPara = () => {
    if (para.length) blocks.push(<p key={blocks.length}>{inline(para.join(' '))}</p>)
    para = []
  }
  const flushList = () => {
    if (list.length)
      blocks.push(
        <ul key={blocks.length}>
          {list.map((li, i) => (
            <li key={i}>{inline(li)}</li>
          ))}
        </ul>,
      )
    list = []
  }
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    if (line.startsWith('## ')) {
      flushPara()
      flushList()
      blocks.push(<h2 key={blocks.length}>{line.slice(3)}</h2>)
    } else if (line.startsWith('- ')) {
      flushPara()
      list.push(line.slice(2))
    } else if (!line.trim()) {
      flushPara()
      flushList()
    } else {
      flushList()
      para.push(line.trim())
    }
  }
  flushPara()
  flushList()
  return <div className="prose-crown">{blocks}</div>
}

function inline(s: string): ReactNode {
  // Only **bold** is supported.
  const parts = s.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>))
}
