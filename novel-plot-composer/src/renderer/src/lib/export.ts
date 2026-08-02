import type { Project } from './types'
import { estimatedChars, sortedBeats } from './project'

function positionLabel(beat: { kind: string; start: number; end: number }): string {
  return beat.kind === 'span' ? `${beat.start}–${beat.end}%` : `${beat.start}%`
}

/** 構成表としての Markdown。人に見せる・GitHub に貼る用。 */
export function toMarkdown(project: Project): string {
  const lines: string[] = []
  lines.push(`# ${project.title || '無題のプロット'}`, '')

  if (project.logline) lines.push(`> ${project.logline}`, '')
  const meta: string[] = []
  if (project.genre) meta.push(`ジャンル: ${project.genre}`)
  if (project.theme) meta.push(`テーマ: ${project.theme}`)
  meta.push(`想定文字数: ${project.targetChars.toLocaleString()} 字`)
  lines.push(meta.join(' / '), '')

  if (project.characters.length > 0) {
    lines.push('## 登場人物', '')
    for (const c of project.characters) {
      lines.push(`- **${c.name}**${c.role ? `（${c.role}）` : ''}${c.note ? ` — ${c.note}` : ''}`)
    }
    lines.push('')
  }

  lines.push('## 構成', '')
  lines.push('| 位置 | ビート | 一行まとめ | 目安 |')
  lines.push('| --- | --- | --- | --- |')
  for (const b of sortedBeats(project.beats)) {
    const summary = (b.summary || '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
    lines.push(`| ${positionLabel(b)} | ${b.name} | ${summary} | ${estimatedChars(b, project).toLocaleString()} 字 |`)
  }
  lines.push('')

  lines.push('## 各ビートの内容', '')
  for (const b of sortedBeats(project.beats)) {
    lines.push(`### ${b.name} — ${positionLabel(b)}`, '')
    if (b.summary) lines.push(`**${b.summary}**`, '')
    if (b.body) lines.push(b.body, '')
    const cast = b.characterIds
      .map((id) => project.characters.find((c) => c.id === id)?.name)
      .filter(Boolean)
    if (cast.length > 0) lines.push(`登場: ${cast.join('、')}`, '')
  }

  if (project.subplots.length > 0) {
    lines.push('## サブプロット', '')
    for (const s of project.subplots) {
      lines.push(`### ${s.name} — ${s.start}–${s.end}%`, '')
      if (s.note) lines.push(s.note, '')
    }
  }

  return lines.join('\n')
}

/** 執筆に持ち込む用。見出しと本文だけの素のテキスト。 */
export function toManuscriptText(project: Project): string {
  const out: string[] = [project.title || '無題のプロット', '']
  for (const b of sortedBeats(project.beats)) {
    out.push(`■ ${b.name}（${positionLabel(b)} / 目安 ${estimatedChars(b, project).toLocaleString()} 字）`)
    if (b.summary) out.push(`　${b.summary}`)
    if (b.body) out.push('', b.body)
    out.push('', '')
  }
  return out.join('\n')
}
