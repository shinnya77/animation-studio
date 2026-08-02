import type { Project } from './types'
import { parseProject, safeFileName, serializeProject } from './project'

/**
 * Electron のときは IPC、ブラウザのときはダウンロード / ファイル選択にフォールバックする。
 * レンダラーが Electron に依存しないので `npm run web` でもそのまま動く。
 */
const api = (): Window['api'] => (typeof window !== 'undefined' ? window.api : undefined)

export const isDesktop = (): boolean => Boolean(api()?.isElectron)

export interface OpenResult {
  project: Project
  path?: string
}

export async function openProjectFile(): Promise<OpenResult | null> {
  const desktop = api()
  if (desktop) {
    const res = await desktop.openProject()
    if (!res) return null
    return { project: parseProject(res.text), path: res.path }
  }

  return new Promise<OpenResult | null>((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.novelplot,.json,application/json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      try {
        resolve({ project: parseProject(await file.text()) })
      } catch (err) {
        reject(err)
      }
    }
    // キャンセルされた場合に Promise が残らないよう、フォーカス復帰で決着させる。
    window.addEventListener('focus', () => setTimeout(() => resolve(null), 500), { once: true })
    input.click()
  })
}

export async function saveProjectFile(project: Project, path?: string): Promise<string | null> {
  const text = serializeProject(project)
  const desktop = api()
  if (desktop) {
    const res = await desktop.saveProject({ text, path, defaultName: safeFileName(project.title) })
    return res?.path ?? null
  }
  downloadText(text, safeFileName(project.title), 'application/json')
  return null
}

export async function exportText(
  text: string,
  defaultName: string,
  ext: string,
  label: string
): Promise<void> {
  const desktop = api()
  if (desktop) {
    await desktop.exportFile({ text, defaultName, ext, label })
    return
  }
  downloadText(text, defaultName, 'text/plain')
}

function downloadText(text: string, name: string, mime: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const AUTOSAVE_KEY = 'novel-plot-composer:autosave'

export async function loadAutosave(): Promise<Project | null> {
  const desktop = api()
  try {
    if (desktop) {
      const settings = await desktop.getSettings()
      const raw = settings[AUTOSAVE_KEY]
      return typeof raw === 'string' ? parseProject(raw) : null
    }
    const raw = localStorage.getItem(AUTOSAVE_KEY)
    return raw ? parseProject(raw) : null
  } catch {
    return null
  }
}

export async function saveAutosave(project: Project, path?: string): Promise<void> {
  const text = serializeProject(project)
  const desktop = api()
  try {
    if (desktop) {
      const settings = await desktop.getSettings()
      await desktop.setSettings({ ...settings, [AUTOSAVE_KEY]: text, lastPath: path ?? null })
      return
    }
    localStorage.setItem(AUTOSAVE_KEY, text)
  } catch {
    // 保存領域が使えない環境でも編集自体は続けられるようにする。
  }
}

export function setWindowState(title: string, dirty: boolean): void {
  const desktop = api()
  desktop?.setTitle(`${dirty ? '● ' : ''}${title || '無題のプロット'} — Novel Plot Composer`)
  desktop?.setDirty(dirty)
}

export function onMenuCommand(channel: string, handler: () => void): () => void {
  return api()?.onMenu(channel, handler) ?? (() => {})
}
