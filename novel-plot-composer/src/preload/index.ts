import { contextBridge, ipcRenderer } from 'electron'

const api = {
  isElectron: true as const,

  openProject: (): Promise<{ path: string; text: string } | null> => ipcRenderer.invoke('dialog:open'),

  saveProject: (args: { text: string; path?: string; defaultName?: string }): Promise<{ path: string } | null> =>
    ipcRenderer.invoke('dialog:save', args),

  exportFile: (args: { text: string; defaultName: string; ext: string; label: string }): Promise<{ path: string } | null> =>
    ipcRenderer.invoke('dialog:export', args),

  readFile: (path: string): Promise<{ path: string; text: string } | null> => ipcRenderer.invoke('file:read', path),

  getSettings: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('settings:get'),
  setSettings: (next: Record<string, unknown>): Promise<boolean> => ipcRenderer.invoke('settings:set', next),

  setDirty: (dirty: boolean): Promise<boolean> => ipcRenderer.invoke('window:set-dirty', dirty),
  setTitle: (title: string): Promise<boolean> => ipcRenderer.invoke('window:set-title', title),

  /** メニューからのコマンドを購読する。戻り値を呼ぶと購読解除。 */
  onMenu: (channel: string, handler: () => void): (() => void) => {
    const listener = (): void => handler()
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
