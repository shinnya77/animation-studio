import type { ActNo, Beat, Character, Project, Subplot } from './types'
import { getTemplate } from './templates'

export function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export const ACT_COLORS: Record<ActNo, string> = {
  1: '#f0c48a',
  2: '#dd9b52',
  3: '#c26f2c'
}

export const SUBPLOT_PALETTE = ['#6b8fb5', '#7fa87f', '#b57f9e', '#8b84c0', '#c19a5b', '#5f9ea0']

export function createProject(templateId = 'bs2', title = '無題のプロット'): Project {
  const template = getTemplate(templateId)
  const now = new Date().toISOString()
  return {
    version: 1,
    id: uid(),
    title,
    logline: '',
    theme: '',
    genre: '',
    targetChars: 100000,
    templateId: template.id,
    beats: template.beats.map((b) => ({
      ...b,
      id: uid(),
      summary: '',
      body: '',
      characterIds: [],
      done: false
    })),
    characters: [],
    subplots: [],
    createdAt: now,
    updatedAt: now
  }
}

/**
 * テンプレートを差し替える。書いた内容は失わせない：
 * 同名のビートには中身をそのまま移し、対応するビートがないものも、
 * 何か書いてあれば元の位置に残す（空のものだけ捨てる）。
 * これで「三幕構成で下書き → BS2 に詰め直す」を往復しても原稿が消えない。
 */
export function applyTemplate(project: Project, templateId: string): Project {
  const template = getTemplate(templateId)
  const byName = new Map(project.beats.map((b) => [b.name, b]))
  const templateNames = new Set(template.beats.map((b) => b.name))

  const fromTemplate: Beat[] = template.beats.map((b) => {
    const prev = byName.get(b.name)
    return {
      ...b,
      id: prev?.id ?? uid(),
      summary: prev?.summary ?? '',
      body: prev?.body ?? '',
      characterIds: prev?.characterIds ?? [],
      done: prev?.done ?? false
    }
  })

  const carriedOver = project.beats.filter(
    (b) => !templateNames.has(b.name) && (b.summary.trim().length > 0 || b.body.trim().length > 0)
  )

  return { ...project, templateId: template.id, beats: [...fromTemplate, ...carriedOver] }
}

export function createCharacter(index: number): Character {
  return {
    id: uid(),
    name: `人物 ${index + 1}`,
    role: '',
    color: SUBPLOT_PALETTE[index % SUBPLOT_PALETTE.length],
    note: ''
  }
}

export function createSubplot(index: number): Subplot {
  return {
    id: uid(),
    name: `サブプロット ${index + 1}`,
    color: SUBPLOT_PALETTE[index % SUBPLOT_PALETTE.length],
    start: 22,
    end: 80,
    note: ''
  }
}

export function createBeat(at: number): Beat {
  return {
    id: uid(),
    name: '新しいビート',
    kind: 'point',
    start: at,
    end: at,
    act: actForPosition(at),
    guide: '',
    summary: '',
    body: '',
    characterIds: [],
    done: false
  }
}

export function actForPosition(pos: number): ActNo {
  if (pos < 20) return 1
  if (pos < 80) return 2
  return 3
}

export function clampPercent(v: number): number {
  return Math.min(100, Math.max(0, Math.round(v * 2) / 2))
}

export function sortedBeats(beats: Beat[]): Beat[] {
  return [...beats].sort((a, b) => a.start - b.start || a.end - b.end)
}

/** ビートが受け持つ尺（%）。point は前後のビートまでの距離から推定する。 */
export function beatWeight(beat: Beat, all: Beat[]): number {
  if (beat.kind === 'span') return Math.max(0, beat.end - beat.start)
  const points = sortedBeats(all.filter((b) => b.kind === 'point'))
  const i = points.findIndex((b) => b.id === beat.id)
  if (i === -1) return 0
  const prev = i > 0 ? points[i - 1].start : 0
  const next = i < points.length - 1 ? points[i + 1].start : 100
  return (next - prev) / 2
}

export function estimatedChars(beat: Beat, project: Project): number {
  const spans = project.beats.filter((b) => b.kind === 'span')
  // span で埋まっている部分は span 基準、point しかない構成では point 基準で按分する。
  const base = spans.length > 0 ? spans : project.beats
  const total = base.reduce((sum, b) => sum + beatWeight(b, project.beats), 0)
  if (total <= 0) return 0
  return Math.round((beatWeight(beat, project.beats) / total) * project.targetChars)
}

export function writtenChars(project: Project): number {
  return project.beats.reduce((sum, b) => sum + b.body.replace(/\s/g, '').length, 0)
}

export function progress(project: Project): { done: number; total: number; ratio: number } {
  const total = project.beats.length
  const done = project.beats.filter((b) => b.done).length
  return { done, total, ratio: total === 0 ? 0 : done / total }
}

/** 保存ファイルを読み込む。壊れていたら例外を投げる。 */
export function parseProject(text: string): Project {
  const raw = JSON.parse(text) as Partial<Project>
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.beats)) {
    throw new Error('プロットファイルとして読み取れませんでした。')
  }
  const fallback = createProject(raw.templateId ?? 'bs2')
  return {
    ...fallback,
    ...raw,
    version: 1,
    beats: raw.beats.map((b) => ({
      id: b.id ?? uid(),
      name: b.name ?? '無題のビート',
      kind: b.kind === 'span' ? 'span' : 'point',
      start: clampPercent(b.start ?? 0),
      end: clampPercent(b.end ?? b.start ?? 0),
      act: b.act ?? actForPosition(b.start ?? 0),
      guide: b.guide ?? '',
      summary: b.summary ?? '',
      body: b.body ?? '',
      characterIds: Array.isArray(b.characterIds) ? b.characterIds : [],
      done: Boolean(b.done)
    })),
    characters: Array.isArray(raw.characters) ? raw.characters : [],
    subplots: Array.isArray(raw.subplots) ? raw.subplots : []
  }
}

export function serializeProject(project: Project): string {
  return JSON.stringify({ ...project, updatedAt: new Date().toISOString() }, null, 2)
}

export function safeFileName(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|]/g, '_').trim()
  return (cleaned.length > 0 ? cleaned : 'untitled') + '.novelplot'
}
