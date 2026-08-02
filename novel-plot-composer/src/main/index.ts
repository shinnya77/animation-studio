import { app, shell, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import { join } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const FILTERS = [
  { name: 'Novel Plot Project', extensions: ['novelplot', 'json'] },
  { name: 'すべてのファイル', extensions: ['*'] }
]

let mainWindow: BrowserWindow | null = null

/** アプリ設定（最近使ったファイル・最後に開いたプロジェクト）の置き場 */
function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

async function readSettings(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(settingsPath(), 'utf-8'))
  } catch {
    return {}
  }
}

async function writeSettings(next: Record<string, unknown>): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(settingsPath(), JSON.stringify(next, null, 2), 'utf-8')
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: false,
    backgroundColor: '#f7f4ef',
    title: 'Novel Plot Composer',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** レンダラー側のコマンドを呼び出すだけの薄いメニュー */
function buildMenu(): void {
  const send = (channel: string) => () => mainWindow?.webContents.send(channel)
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'ファイル',
      submenu: [
        { label: '新規プロジェクト', accelerator: 'CmdOrCtrl+N', click: send('menu:new') },
        { label: '開く…', accelerator: 'CmdOrCtrl+O', click: send('menu:open') },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: send('menu:save') },
        { label: '名前を付けて保存…', accelerator: 'CmdOrCtrl+Shift+S', click: send('menu:save-as') },
        { type: 'separator' },
        { label: 'Markdown で書き出し…', click: send('menu:export-md') },
        { label: '執筆用テキストで書き出し…', click: send('menu:export-txt') },
        { type: 'separator' },
        isMac ? { role: 'close' as const } : { role: 'quit' as const }
      ]
    },
    {
      label: '編集',
      submenu: [
        { label: '元に戻す', accelerator: 'CmdOrCtrl+Z', click: send('menu:undo') },
        { label: 'やり直し', accelerator: 'CmdOrCtrl+Shift+Z', click: send('menu:redo') },
        { type: 'separator' },
        { role: 'cut' as const, label: '切り取り' },
        { role: 'copy' as const, label: 'コピー' },
        { role: 'paste' as const, label: '貼り付け' },
        { role: 'selectAll' as const, label: 'すべて選択' }
      ]
    },
    {
      label: '表示',
      submenu: [
        { role: 'reload' as const, label: '再読み込み' },
        { role: 'toggleDevTools' as const, label: '開発者ツール' },
        { type: 'separator' },
        { role: 'resetZoom' as const, label: '実際のサイズ' },
        { role: 'zoomIn' as const, label: '拡大' },
        { role: 'zoomOut' as const, label: '縮小' },
        { type: 'separator' },
        { role: 'togglefullscreen' as const, label: 'フルスクリーン' }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function registerIpc(): void {
  ipcMain.handle('dialog:open', async () => {
    if (!mainWindow) return null
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'プロットを開く',
      properties: ['openFile'],
      filters: FILTERS
    })
    if (res.canceled || res.filePaths.length === 0) return null
    const path = res.filePaths[0]
    return { path, text: await readFile(path, 'utf-8') }
  })

  ipcMain.handle('dialog:save', async (_e, args: { text: string; path?: string; defaultName?: string }) => {
    if (!mainWindow) return null
    let path = args.path
    if (!path) {
      const res = await dialog.showSaveDialog(mainWindow, {
        title: 'プロットを保存',
        defaultPath: args.defaultName ?? 'untitled.novelplot',
        filters: FILTERS
      })
      if (res.canceled || !res.filePath) return null
      path = res.filePath
    }
    await writeFile(path, args.text, 'utf-8')
    return { path }
  })

  ipcMain.handle(
    'dialog:export',
    async (_e, args: { text: string; defaultName: string; ext: string; label: string }) => {
      if (!mainWindow) return null
      const res = await dialog.showSaveDialog(mainWindow, {
        title: '書き出し',
        defaultPath: args.defaultName,
        filters: [{ name: args.label, extensions: [args.ext] }]
      })
      if (res.canceled || !res.filePath) return null
      await writeFile(res.filePath, args.text, 'utf-8')
      return { path: res.filePath }
    }
  )

  ipcMain.handle('file:read', async (_e, path: string) => {
    try {
      return { path, text: await readFile(path, 'utf-8') }
    } catch {
      return null
    }
  })

  ipcMain.handle('settings:get', async () => readSettings())
  ipcMain.handle('settings:set', async (_e, next: Record<string, unknown>) => {
    await writeSettings(next)
    return true
  })

  ipcMain.handle('window:set-dirty', (_e, dirty: boolean) => {
    mainWindow?.setDocumentEdited?.(dirty)
    return true
  })

  ipcMain.handle('window:set-title', (_e, title: string) => {
    mainWindow?.setTitle(title)
    return true
  })
}

app.whenReady().then(() => {
  registerIpc()
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
