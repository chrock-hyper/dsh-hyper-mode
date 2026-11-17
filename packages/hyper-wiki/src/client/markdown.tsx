/**
 * A deliberately plain Markdown preview: headings, lists, quotes, code, and
 * paragraphs, all as text — no renderer, no HTML injection.
 *
 * Every block is a flat element the preview pane drops in directly, so the
 * document's own whitespace survives: paragraphs and code keep their newlines
 * as text children, and `<pre>` keeps `white-space: pre` from the stylesheet.
 */

import type { ReactElement } from 'react'

/**
 * @param text - page document.
 * @returns React nodes, one per rendered block.
 */
export function renderPreview(text: string): ReactElement[] {
  const lines = String(text || '').split('\n')
  const nodes: ReactElement[] = []
  let paragraph: string[] = []
  let code: string[] | null = null
  const flushParagraph = () => {
    if (paragraph.length === 0) return
    nodes.push(<p key={'p' + nodes.length} className="dw-md-p">{paragraph.join('\n')}</p>)
    paragraph = []
  }
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (code === null) {
        flushParagraph()
        code = []
      } else {
        nodes.push(<pre key={'c' + nodes.length} className="dw-md-code">{code.join('\n')}</pre>)
        code = null
      }
      continue
    }
    if (code !== null) {
      code.push(line)
      continue
    }
    if (line.trim() === '') {
      flushParagraph()
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      flushParagraph()
      nodes.push(
        <div key={'h' + nodes.length} className={'dw-md-h dw-md-h' + (heading[1] ?? '').length}>{heading[2] ?? ''}</div>,
      )
      continue
    }
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      flushParagraph()
      nodes.push(<div key={'l' + nodes.length} className="dw-md-li">{line}</div>)
      continue
    }
    if (/^\s*>\s?/.test(line)) {
      flushParagraph()
      nodes.push(<div key={'q' + nodes.length} className="dw-md-quote">{line.replace(/^\s*>\s?/, '')}</div>)
      continue
    }
    paragraph.push(line)
  }
  flushParagraph()
  if (code !== null) nodes.push(<pre key="c-end" className="dw-md-code">{code.join('\n')}</pre>)
  return nodes.length === 0 ? [<p key="empty" className="dw-muted">{''}</p>] : nodes
}
