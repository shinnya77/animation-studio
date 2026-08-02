export interface DesktopApi {
  isElectron: true
  openProject(): Promise<{ path: string; text: string } | null>
  saveProject(args: { text: string; path?: string; defaultName?: string }): Promise<{ path: string } | null>
  exportFile(args: { text: string; defaultName: string; ext: string; label: string }): Promise<{ path: string } | null>
  readFile(path: string): Promise<{ path: string; text: string } | null>
  getSettings(): Promise<Record<string, unknown>>
  setSettings(next: Record<string, unknown>): Promise<boolean>
  setDirty(dirty: boolean): Promise<boolean>
  setTitle(title: string): Promise<boolean>
  onMenu(channel: string, handler: () => void): () => void
}

declare global {
  interface Window {
    api?: DesktopApi
  }
}

export {}
