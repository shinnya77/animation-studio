interface Props {
  title: string
  dirty: boolean
  canUndo: boolean
  canRedo: boolean
  zoom: number
  onNew: () => void
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  onExportMarkdown: () => void
  onExportText: () => void
  onUndo: () => void
  onRedo: () => void
  onAddBeat: () => void
  onZoom: (zoom: number) => void
}

export function Toolbar(props: Props): JSX.Element {
  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">Novel Plot Composer</span>
        <span className="doc-name">
          {props.title || '無題のプロット'}
          {props.dirty && <em className="dot" title="未保存の変更があります">●</em>}
        </span>
      </div>

      <div className="toolbar-actions">
        <button type="button" onClick={props.onNew}>
          新規
        </button>
        <button type="button" onClick={props.onOpen}>
          開く
        </button>
        <button type="button" onClick={props.onSave}>
          保存
        </button>
        <button type="button" onClick={props.onSaveAs}>
          別名で保存
        </button>

        <span className="sep" />

        <button type="button" disabled={!props.canUndo} onClick={props.onUndo} title="Ctrl/Cmd + Z">
          元に戻す
        </button>
        <button type="button" disabled={!props.canRedo} onClick={props.onRedo} title="Ctrl/Cmd + Shift + Z">
          やり直し
        </button>

        <span className="sep" />

        <button type="button" onClick={props.onAddBeat}>
          ＋ ビート
        </button>
        <button type="button" onClick={props.onExportMarkdown}>
          Markdown
        </button>
        <button type="button" onClick={props.onExportText}>
          執筆用テキスト
        </button>

        <span className="sep" />

        <label className="zoom" title="タイムラインの高さ">
          <span aria-hidden="true">⇕</span>
          <input
            type="range"
            min={600}
            max={2600}
            step={50}
            value={props.zoom}
            onChange={(e) => props.onZoom(Number(e.target.value))}
          />
        </label>
      </div>
    </header>
  )
}
