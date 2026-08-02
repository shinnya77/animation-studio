import { useCallback, useEffect, useRef, useState } from 'react'
import { BeatTimeline } from './components/BeatTimeline'
import { BeatInspector } from './components/BeatInspector'
import { ProjectPanel } from './components/ProjectPanel'
import { Toolbar } from './components/Toolbar'
import type { Beat, Character, Project, Selection, Subplot } from './lib/types'
import {
  applyTemplate,
  clampPercent,
  createBeat,
  createCharacter,
  createProject,
  createSubplot,
  safeFileName
} from './lib/project'
import { toManuscriptText, toMarkdown } from './lib/export'
import {
  exportText,
  loadAutosave,
  onMenuCommand,
  openProjectFile,
  saveAutosave,
  saveProjectFile,
  setWindowState
} from './lib/storage'
import { useProjectHistory } from './lib/useProjectHistory'

export function App(): JSX.Element {
  const store = useProjectHistory(createProject())
  const { project, update, reset } = store

  const [selection, setSelection] = useState<Selection>(null)
  const [zoom, setZoom] = useState(1100)
  const [filePath, setFilePath] = useState<string | undefined>(undefined)
  const [dirty, setDirty] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // 保存済みの内容と比べるための基準。保存・読み込みのたびに更新する。
  const savedSnapshot = useRef<string>(JSON.stringify(project))

  const notify = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 2600)
  }, [])

  // 復元が終わるまで自動保存を止める。空の初期プロジェクトで前回の内容を
  // 上書きしてしまうのを防ぐため。
  const [restoreDone, setRestoreDone] = useState(false)

  /* ---------- 起動時に前回の内容を復元 ---------- */
  useEffect(() => {
    let cancelled = false
    loadAutosave()
      .then((restored) => {
        if (cancelled) return
        if (restored) {
          reset(restored)
          savedSnapshot.current = JSON.stringify(restored)
        }
      })
      .finally(() => {
        if (!cancelled) setRestoreDone(true)
      })
    return () => {
      cancelled = true
    }
  }, [reset])

  /* ---------- 変更検知と自動保存 ---------- */
  useEffect(() => {
    const serialized = JSON.stringify(project)
    setDirty(serialized !== savedSnapshot.current)
    setWindowState(project.title, serialized !== savedSnapshot.current)
    if (!restoreDone) return
    const timer = window.setTimeout(() => void saveAutosave(project, filePath), 600)
    return () => window.clearTimeout(timer)
  }, [project, filePath, restoreDone])

  /* ---------- 編集操作 ---------- */
  const updateProject = useCallback(
    (patch: Partial<Project>, label?: string) => update((p) => ({ ...p, ...patch }), label),
    [update]
  )

  const updateBeat = useCallback(
    (id: string, patch: Partial<Beat>, label?: string) =>
      update(
        (p) => ({
          ...p,
          beats: p.beats.map((b) => {
            if (b.id !== id) return b
            const next = { ...b, ...patch }
            next.start = clampPercent(next.start)
            next.end = clampPercent(Math.max(next.end, next.start))
            if (next.kind === 'point') next.end = next.start
            return next
          })
        }),
        label
      ),
    [update]
  )

  const moveBeat = useCallback(
    (id: string, start: number, end: number) => updateBeat(id, { start, end }),
    [updateBeat]
  )

  const updateSubplot = useCallback(
    (id: string, patch: Partial<Subplot>, label?: string) =>
      update(
        (p) => ({
          ...p,
          subplots: p.subplots.map((s) => {
            if (s.id !== id) return s
            const next = { ...s, ...patch }
            next.start = clampPercent(next.start)
            next.end = clampPercent(Math.max(next.end, next.start))
            return next
          })
        }),
        label
      ),
    [update]
  )

  const moveSubplot = useCallback(
    (id: string, start: number, end: number) => updateSubplot(id, { start, end }),
    [updateSubplot]
  )

  const addBeatAt = useCallback(
    (pct: number) => {
      const beat = createBeat(clampPercent(pct))
      update((p) => ({ ...p, beats: [...p.beats, beat] }))
      setSelection({ type: 'beat', id: beat.id })
    },
    [update]
  )

  const deleteBeat = useCallback(
    (id: string) => {
      update((p) => ({ ...p, beats: p.beats.filter((b) => b.id !== id) }))
      setSelection(null)
    },
    [update]
  )

  const addCharacter = useCallback(
    () => update((p) => ({ ...p, characters: [...p.characters, createCharacter(p.characters.length)] })),
    [update]
  )

  const updateCharacter = useCallback(
    (id: string, patch: Partial<Character>, label?: string) =>
      update((p) => ({ ...p, characters: p.characters.map((c) => (c.id === id ? { ...c, ...patch } : c)) }), label),
    [update]
  )

  const deleteCharacter = useCallback(
    (id: string) =>
      update((p) => ({
        ...p,
        characters: p.characters.filter((c) => c.id !== id),
        // 参照が残るとビート側で存在しない人物を指してしまうので、同時に外す。
        beats: p.beats.map((b) => ({ ...b, characterIds: b.characterIds.filter((cid) => cid !== id) }))
      })),
    [update]
  )

  const addSubplot = useCallback(() => {
    let created: Subplot | null = null
    update((p) => {
      created = createSubplot(p.subplots.length)
      return { ...p, subplots: [...p.subplots, created] }
    })
    if (created) setSelection({ type: 'subplot', id: (created as Subplot).id })
  }, [update])

  const deleteSubplot = useCallback(
    (id: string) => {
      update((p) => ({ ...p, subplots: p.subplots.filter((s) => s.id !== id) }))
      setSelection(null)
    },
    [update]
  )

  const changeTemplate = useCallback(
    (templateId: string) => {
      update((p) => applyTemplate(p, templateId))
      setSelection(null)
    },
    [update]
  )

  /* ---------- ファイル操作 ---------- */
  const handleNew = useCallback(() => {
    if (dirty && !window.confirm('保存していない変更があります。新規作成しますか？')) return
    const fresh = createProject(project.templateId)
    reset(fresh)
    savedSnapshot.current = JSON.stringify(fresh)
    setFilePath(undefined)
    setSelection(null)
  }, [dirty, project.templateId, reset])

  const handleOpen = useCallback(async () => {
    if (dirty && !window.confirm('保存していない変更があります。別のファイルを開きますか？')) return
    try {
      const result = await openProjectFile()
      if (!result) return
      reset(result.project)
      savedSnapshot.current = JSON.stringify(result.project)
      setFilePath(result.path)
      setSelection(null)
      notify('読み込みました')
    } catch {
      notify('このファイルは読み込めませんでした')
    }
  }, [dirty, reset, notify])

  const handleSave = useCallback(
    async (forceDialog = false) => {
      try {
        const path = await saveProjectFile(project, forceDialog ? undefined : filePath)
        if (path) setFilePath(path)
        savedSnapshot.current = JSON.stringify(project)
        setDirty(false)
        notify('保存しました')
      } catch {
        notify('保存に失敗しました')
      }
    },
    [project, filePath, notify]
  )

  const handleExportMarkdown = useCallback(async () => {
    await exportText(toMarkdown(project), safeFileName(project.title).replace(/\.novelplot$/, '.md'), 'md', 'Markdown')
    notify('Markdown を書き出しました')
  }, [project, notify])

  const handleExportText = useCallback(async () => {
    await exportText(
      toManuscriptText(project),
      safeFileName(project.title).replace(/\.novelplot$/, '.txt'),
      'txt',
      'テキスト'
    )
    notify('テキストを書き出しました')
  }, [project, notify])

  /* ---------- メニューとショートカット ---------- */
  useEffect(() => {
    const offs = [
      onMenuCommand('menu:new', handleNew),
      onMenuCommand('menu:open', () => void handleOpen()),
      onMenuCommand('menu:save', () => void handleSave(false)),
      onMenuCommand('menu:save-as', () => void handleSave(true)),
      onMenuCommand('menu:export-md', () => void handleExportMarkdown()),
      onMenuCommand('menu:export-txt', () => void handleExportText()),
      onMenuCommand('menu:undo', store.undo),
      onMenuCommand('menu:redo', store.redo)
    ]
    return () => offs.forEach((off) => off())
  }, [handleNew, handleOpen, handleSave, handleExportMarkdown, handleExportText, store.undo, store.redo])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const key = e.key.toLowerCase()
      if (key === 's') {
        e.preventDefault()
        void handleSave(e.shiftKey)
      } else if (key === 'o') {
        e.preventDefault()
        void handleOpen()
      } else if (key === 'z') {
        // テキスト入力中は、その欄自身の取り消しを優先する。
        const tag = (e.target as HTMLElement | null)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        if (e.shiftKey) store.redo()
        else store.undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleSave, handleOpen, store])

  return (
    <div className="app">
      <Toolbar
        title={project.title}
        dirty={dirty}
        canUndo={store.canUndo}
        canRedo={store.canRedo}
        zoom={zoom}
        onNew={handleNew}
        onOpen={() => void handleOpen()}
        onSave={() => void handleSave(false)}
        onSaveAs={() => void handleSave(true)}
        onExportMarkdown={() => void handleExportMarkdown()}
        onExportText={() => void handleExportText()}
        onUndo={store.undo}
        onRedo={store.redo}
        onAddBeat={() => addBeatAt(50)}
        onZoom={setZoom}
      />

      <main className="workspace">
        <ProjectPanel
          project={project}
          selection={selection}
          onUpdateProject={updateProject}
          onChangeTemplate={changeTemplate}
          onAddCharacter={addCharacter}
          onUpdateCharacter={updateCharacter}
          onDeleteCharacter={deleteCharacter}
          onAddSubplot={addSubplot}
          onUpdateSubplot={updateSubplot}
          onSelect={setSelection}
        />

        <section className="stage">
          <BeatTimeline
            project={project}
            selection={selection}
            zoom={zoom}
            onSelect={setSelection}
            onMoveBeat={moveBeat}
            onMoveSubplot={moveSubplot}
            onAddBeatAt={addBeatAt}
            onDragStart={store.beginBatch}
            onDragEnd={store.endBatch}
          />
        </section>

        <BeatInspector
          project={project}
          selection={selection}
          onUpdateBeat={updateBeat}
          onUpdateSubplot={updateSubplot}
          onDeleteBeat={deleteBeat}
          onDeleteSubplot={deleteSubplot}
        />
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
