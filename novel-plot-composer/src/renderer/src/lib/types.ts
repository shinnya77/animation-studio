export type BeatKind = 'point' | 'span'
export type ActNo = 1 | 2 | 3

/**
 * ビート＝物語の節目。
 * point は「その瞬間に起きる出来事」（例: ミッドポイント）、
 * span は「一定の幅を持つ区間」（例: お楽しみ）。
 * start / end は物語全体を 0–100 とした位置で、point は start === end。
 */
export interface Beat {
  id: string
  name: string
  kind: BeatKind
  start: number
  end: number
  act: ActNo
  /** テンプレート由来の手引き。ユーザーの原稿とは分けて保持する。 */
  guide: string
  /** 一行で言うと何が起きるか */
  summary: string
  /** そのビートのメモ・下書き */
  body: string
  /** このビートに登場する人物の id */
  characterIds: string[]
  /** 書けたかどうかのチェック */
  done: boolean
}

export interface Character {
  id: string
  name: string
  role: string
  color: string
  note: string
}

/** B ストーリーなど、本筋と並走する線。タイムライン脇に帯で描く。 */
export interface Subplot {
  id: string
  name: string
  color: string
  start: number
  end: number
  note: string
}

export interface Project {
  version: 1
  id: string
  title: string
  logline: string
  theme: string
  genre: string
  /** 想定総文字数。各ビートの目安文字数を出すのに使う。 */
  targetChars: number
  templateId: string
  beats: Beat[]
  characters: Character[]
  subplots: Subplot[]
  createdAt: string
  updatedAt: string
}

export interface Template {
  id: string
  name: string
  description: string
  /** 生成時に id / 編集用フィールドを埋めるので、雛形は最小限の情報だけ持つ。 */
  beats: Array<Pick<Beat, 'name' | 'kind' | 'start' | 'end' | 'act' | 'guide'>>
}

export type Selection = { type: 'beat'; id: string } | { type: 'subplot'; id: string } | null
