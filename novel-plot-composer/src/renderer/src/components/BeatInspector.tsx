import type { Beat, Project, Selection, Subplot } from '@/lib/types'
import { estimatedChars } from '@/lib/project'

interface Props {
  project: Project
  selection: Selection
  onUpdateBeat: (id: string, patch: Partial<Beat>, label?: string) => void
  onUpdateSubplot: (id: string, patch: Partial<Subplot>, label?: string) => void
  onDeleteBeat: (id: string) => void
  onDeleteSubplot: (id: string) => void
}

export function BeatInspector({
  project,
  selection,
  onUpdateBeat,
  onUpdateSubplot,
  onDeleteBeat,
  onDeleteSubplot
}: Props): JSX.Element {
  if (!selection) {
    return (
      <aside className="inspector">
        <div className="empty">
          <p className="empty-title">ビートを選んでください</p>
          <p>
            左のタイムラインでビート名をクリックすると、ここで内容を書けます。
            ラベルは上下にドラッグして位置を変えられます。区間は端をドラッグで伸縮します。
          </p>
          <p>目盛りをダブルクリックすると、その位置に新しいビートを追加します。</p>
        </div>
      </aside>
    )
  }

  if (selection.type === 'subplot') {
    const subplot = project.subplots.find((s) => s.id === selection.id)
    if (!subplot) return <aside className="inspector" />
    return (
      <aside className="inspector">
        <header className="inspector-head">
          <input
            className="inspector-title"
            value={subplot.name}
            onChange={(e) => onUpdateSubplot(subplot.id, { name: e.target.value }, `subplot-name:${subplot.id}`)}
          />
          <span className="tag">サブプロット</span>
        </header>

        <div className="row">
          <label className="field">
            <span>開始 %</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={subplot.start}
              onChange={(e) => onUpdateSubplot(subplot.id, { start: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>終了 %</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={subplot.end}
              onChange={(e) => onUpdateSubplot(subplot.id, { end: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>色</span>
            <input
              type="color"
              value={subplot.color}
              onChange={(e) => onUpdateSubplot(subplot.id, { color: e.target.value })}
            />
          </label>
        </div>

        <label className="field grow">
          <span>メモ</span>
          <textarea
            value={subplot.note}
            placeholder="この線が本筋とどこで交わるか、何を象徴するか"
            onChange={(e) => onUpdateSubplot(subplot.id, { note: e.target.value }, `subplot-note:${subplot.id}`)}
          />
        </label>

        <button type="button" className="danger" onClick={() => onDeleteSubplot(subplot.id)}>
          このサブプロットを削除
        </button>
      </aside>
    )
  }

  const beat = project.beats.find((b) => b.id === selection.id)
  if (!beat) return <aside className="inspector" />

  const estimate = estimatedChars(beat, project)
  const written = beat.body.replace(/\s/g, '').length

  return (
    <aside className="inspector">
      <header className="inspector-head">
        <input
          className="inspector-title"
          value={beat.name}
          onChange={(e) => onUpdateBeat(beat.id, { name: e.target.value }, `beat-name:${beat.id}`)}
        />
        <span className={`tag act-${beat.act}`}>第{beat.act}幕</span>
      </header>

      {beat.guide && <p className="guide">{beat.guide}</p>}

      <div className="row">
        <label className="field">
          <span>種類</span>
          <select
            value={beat.kind}
            onChange={(e) => {
              const kind = e.target.value as Beat['kind']
              // 点 → 区間に変えるときは、後ろに少し幅を持たせて掴めるようにする。
              onUpdateBeat(beat.id, {
                kind,
                end: kind === 'point' ? beat.start : Math.max(beat.end, Math.min(beat.start + 5, 100))
              })
            }}
          >
            <option value="point">点（瞬間）</option>
            <option value="span">区間（幅を持つ）</option>
          </select>
        </label>
        <label className="field">
          <span>{beat.kind === 'span' ? '開始 %' : '位置 %'}</span>
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={beat.start}
            onChange={(e) => {
              const start = Number(e.target.value)
              onUpdateBeat(beat.id, { start, end: beat.kind === 'point' ? start : Math.max(beat.end, start) })
            }}
          />
        </label>
        {beat.kind === 'span' && (
          <label className="field">
            <span>終了 %</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={beat.end}
              onChange={(e) => onUpdateBeat(beat.id, { end: Number(e.target.value) })}
            />
          </label>
        )}
        <label className="field">
          <span>幕</span>
          <select
            value={beat.act}
            onChange={(e) => onUpdateBeat(beat.id, { act: Number(e.target.value) as Beat['act'] })}
          >
            <option value={1}>第1幕</option>
            <option value={2}>第2幕</option>
            <option value={3}>第3幕</option>
          </select>
        </label>
      </div>

      <label className="field">
        <span>一行まとめ</span>
        <input
          value={beat.summary}
          placeholder="ここで何が起きるかを一行で"
          onChange={(e) => onUpdateBeat(beat.id, { summary: e.target.value }, `beat-summary:${beat.id}`)}
        />
      </label>

      <label className="field grow">
        <span>
          内容 <em className="counter">{written.toLocaleString()} / 目安 {estimate.toLocaleString()} 字</em>
        </span>
        <textarea
          value={beat.body}
          placeholder="場面、視点、心情の動き、次のビートへの接続"
          onChange={(e) => onUpdateBeat(beat.id, { body: e.target.value }, `beat-body:${beat.id}`)}
        />
      </label>

      {project.characters.length > 0 && (
        <div className="field">
          <span>登場人物</span>
          <div className="chips">
            {project.characters.map((c) => {
              const on = beat.characterIds.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`chip ${on ? 'is-on' : ''}`}
                  style={on ? { background: c.color, borderColor: c.color } : { borderColor: c.color }}
                  onClick={() =>
                    onUpdateBeat(beat.id, {
                      characterIds: on
                        ? beat.characterIds.filter((id) => id !== c.id)
                        : [...beat.characterIds, c.id]
                    })
                  }
                >
                  {c.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="inspector-foot">
        <label className="check-line">
          <input
            type="checkbox"
            checked={beat.done}
            onChange={(e) => onUpdateBeat(beat.id, { done: e.target.checked })}
          />
          書けた
        </label>
        <button type="button" className="danger" onClick={() => onDeleteBeat(beat.id)}>
          ビートを削除
        </button>
      </div>
    </aside>
  )
}
