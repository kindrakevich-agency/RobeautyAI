/**
 * Мінімальний рендер markdown для відповідей асистента.
 *
 * Порядок критичний: СПЕРШУ екрануємо HTML, і лише потім застосовуємо
 * форматування. Інакше тег у відповіді моделі виконався б у браузері —
 * це найпростіший шлях до XSS через LLM.
 */
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function renderMarkdown(src: string): string {
  const lines = escapeHtml(src).split('\n')
  const out: string[] = []
  let inList = false

  let listTag: 'ul' | 'ol' = 'ul'

  const closeList = => {
    if (inList) { out.push(`</${listTag}>`); inList = false }
  }

  const openList = (tag: 'ul' | 'ol') => {
    if (inList && listTag !== tag) closeList()
    if (!inList) { out.push(`<${tag}>`); inList = true; listTag = tag }
  }

  const inline = (s: string) =>
    s
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
               '<a href="$2" target="_blank" rel="noreferrer">$1</a>')

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) { closeList(); continue }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (heading) {
      closeList()
      const level = heading[1].length + 2
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      continue
    }

    const bullet = /^\s*[-•*]\s+(.*)$/.exec(line)
    if (bullet) {
      openList('ul')
      out.push(`<li>${inline(bullet[1])}</li>`)
      continue
    }

    // Нумеровані пункти: моделі пишуть і «1.», і «1)» — брифінг у шапці
    // приходить саме в такому вигляді, і без цього він лягав суцільним
    // текстом із цифрами й дужками.
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (numbered) {
      openList('ol')
      out.push(`<li>${inline(numbered[1])}</li>`)
      continue
    }

    closeList()
    out.push(`<p>${inline(line)}</p>`)
  }
  closeList()
  return out.join('')
}
