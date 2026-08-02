import { useCallback, useRef, useState } from 'react'
import type { Project } from './types'

interface HistoryState {
  past: Project[]
  present: Project
  future: Project[]
}

const LIMIT = 100
/** 同じ操作が続いている間は履歴をまとめる猶予（ミリ秒）。文字入力を1打鍵ずつ積まないため。 */
const COALESCE_MS = 700

export interface ProjectStore {
  project: Project
  /** label を渡すと、連続した同種の編集を1ステップにまとめる。 */
  update: (fn: (p: Project) => Project, label?: string) => void
  /** 履歴を捨てて差し替える（新規作成・ファイル読み込み用）。 */
  reset: (project: Project) => void
  /** ドラッグのように長く続く操作を1ステップにまとめる。必ず endBatch と対で呼ぶ。 */
  beginBatch: () => void
  endBatch: () => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

export function useProjectHistory(initial: Project): ProjectStore {
  const [state, setState] = useState<HistoryState>({ past: [], present: initial, future: [] })
  const lastEdit = useRef<{ label: string; at: number } | null>(null)
  const batch = useRef<{ pushed: boolean } | null>(null)

  const beginBatch = useCallback(() => {
    batch.current = { pushed: false }
  }, [])

  const endBatch = useCallback(() => {
    batch.current = null
    lastEdit.current = null
  }, [])

  const update = useCallback((fn: (p: Project) => Project, label?: string) => {
    let coalesce: boolean
    if (batch.current) {
      // バッチ中は最初の1回だけ履歴に積み、以降は同じステップに畳む。
      coalesce = batch.current.pushed
      batch.current.pushed = true
    } else {
      const now = Date.now()
      const prev = lastEdit.current
      coalesce = label !== undefined && prev !== null && prev.label === label && now - prev.at < COALESCE_MS
      lastEdit.current = label !== undefined ? { label, at: now } : null
    }

    setState((s) => {
      const next = fn(s.present)
      if (next === s.present) return s
      const past = coalesce ? s.past : [...s.past, s.present].slice(-LIMIT)
      return { past, present: next, future: [] }
    })
  }, [])

  const reset = useCallback((project: Project) => {
    lastEdit.current = null
    batch.current = null
    setState({ past: [], present: project, future: [] })
  }, [])

  const undo = useCallback(() => {
    lastEdit.current = null
    setState((s) => {
      if (s.past.length === 0) return s
      const present = s.past[s.past.length - 1]
      return { past: s.past.slice(0, -1), present, future: [s.present, ...s.future].slice(0, LIMIT) }
    })
  }, [])

  const redo = useCallback(() => {
    lastEdit.current = null
    setState((s) => {
      if (s.future.length === 0) return s
      const [present, ...future] = s.future
      return { past: [...s.past, s.present].slice(-LIMIT), present, future }
    })
  }, [])

  return {
    project: state.present,
    update,
    reset,
    beginBatch,
    endBatch,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0
  }
}
