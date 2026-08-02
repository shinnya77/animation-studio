import { useCallback, useRef, useState } from 'react'
import type { Beat, Project, Selection, Subplot } from '@/lib/types'
import { ACT_COLORS, clampPercent, estimatedChars } from '@/lib/project'

interface Props {
  project: Project
  selection: Selection
  zoom: number
  onSelect: (selection: Selection) => void
  onMoveBeat: (id: string, start: number, end: number) => void
  onMoveSubplot: (id: string, start: number, end: number) => void
  onAddBeatAt: (pct: number) => void
  onDragStart: () => void
  onDragEnd: () => void
}

type DragMode = 'move' | 'resize-start' | 'resize-end'

/** 重なる区間を横方向のレーンに振り分ける。自作ビートが重なっても潰れないように。 */
function assignLanes(items: Array<{ id: string; start: number; end: number }>): Map<string, number> {
  const laneEnds: number[] = []
  const lanes = new Map<string, number>()
  for (const item of [...items].sort((a, b) => a.start - b.start)) {
    let lane = laneEnds.findIndex((end) => end <= item.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(item.end)
    } else {
      laneEnds[lane] = item.end
    }
    lanes.set(item.id, lane)
  }
  return lanes
}

const TICKS = Array.from({ length: 21 }, (_, i) => i * 5)
const SUBPLOT_LANE_W = 22

export function BeatTimeline({
  project,
  selection,
  zoom,
  onSelect,
  onMoveBeat,
  onMoveSubplot,
  onAddBeatAt,
  onDragStart,
  onDragEnd
}: Props): JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<string | null>(null)

  const pctFromClientY = useCallback((clientY: number): number => {
    const el = trackRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return clampPercent(((clientY - rect.top) / rect.height) * 100)
  }, [])

  const beginDrag = useCallback(
    (
      event: React.PointerEvent,
      item: { id: string; start: number; end: number },
      mode: DragMode,
      commit: (id: string, start: number, end: number) => void
    ) => {
      event.preventDefault()
      event.stopPropagation()
      const grabPct = pctFromClientY(event.clientY)
      const origin = { start: item.start, end: item.end }
      const length = origin.end - origin.start

      setDragging(item.id)
      onDragStart()

      const onMove = (ev: PointerEvent): void => {
        const pct = pctFromClientY(ev.clientY)
        const delta = pct - grabPct
        if (mode === 'move') {
          // 全体を動かすときは端で潰れないよう、はみ出す分だけ手前で止める。
          const shift = clampPercent(origin.start + delta) - origin.start
          const start = Math.min(Math.max(origin.start + shift, 0), 100 - length)
          commit(item.id, clampPercent(start), clampPercent(start + length))
        } else if (mode === 'resize-start') {
          commit(item.id, Math.min(pct, origin.end), origin.end)
        } else {
          commit(item.id, origin.start, Math.max(pct, origin.start))
        }
      }

      const onUp = (): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        setDragging(null)
        onDragEnd()
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [pctFromClientY, onDragStart, onDragEnd]
  )

  const points = project.beats.filter((b) => b.kind === 'point')
  const spans = project.beats.filter((b) => b.kind === 'span')
  const spanLanes = assignLanes(spans)
  const spanLaneCount = Math.max(1, ...[...spanLanes.values()].map((v) => v + 1))
  const subplotLanes = assignLanes(project.subplots)
  const subplotLaneCount = project.subplots.length === 0 ? 0 : Math.max(...[...subplotLanes.values()].map((v) => v + 1))
  // サブプロットの帯は目盛りとビート区間のあいだに置くので、その幅だけ区間側をずらす。
  const spansOffset = subplotLaneCount * SUBPLOT_LANE_W

  const isSelected = (id: string): boolean => selection?.id === id

  const renderPoint = (beat: Beat): JSX.Element => (
    <div
      key={beat.id}
      className={`point ${isSelected(beat.id) ? 'is-selected' : ''} ${dragging === beat.id ? 'is-dragging' : ''}`}
      style={{ top: `${beat.start}%` }}
    >
      <button
        type="button"
        className="point-label"
        onClick={() => onSelect({ type: 'beat', id: beat.id })}
        onPointerDown={(e) => beginDrag(e, beat, 'move', onMoveBeat)}
        title={`${beat.name} — ${beat.start}%（ドラッグで位置を変更）`}
      >
        <span className="point-name">
          {beat.done && <span className="check" aria-label="書けた">✓</span>}
          {beat.name}
        </span>
        <span className="point-arrow">▶</span>
      </button>
      <span className="point-connector" />
      <span className="point-dot" style={{ background: ACT_COLORS[beat.act] }} />
    </div>
  )

  const renderSpan = (beat: Beat): JSX.Element => {
    const lane = spanLanes.get(beat.id) ?? 0
    const height = Math.max(beat.end - beat.start, 0.4)
    return (
      <div
        key={beat.id}
        className={`span ${isSelected(beat.id) ? 'is-selected' : ''} ${dragging === beat.id ? 'is-dragging' : ''}`}
        style={{ top: `${beat.start}%`, height: `${height}%`, left: `${lane * 16}px` }}
      >
        <button
          type="button"
          className="span-band"
          style={{ background: ACT_COLORS[beat.act] }}
          onClick={() => onSelect({ type: 'beat', id: beat.id })}
          onPointerDown={(e) => beginDrag(e, beat, 'move', onMoveBeat)}
          title={`${beat.name} — ${beat.start}〜${beat.end}%（ドラッグで移動、端をドラッグで伸縮）`}
        />
        <span
          className="span-handle span-handle-top"
          onPointerDown={(e) => beginDrag(e, beat, 'resize-start', onMoveBeat)}
        />
        <span
          className="span-handle span-handle-bottom"
          onPointerDown={(e) => beginDrag(e, beat, 'resize-end', onMoveBeat)}
        />
        <button
          type="button"
          className="span-label"
          style={{ left: `${(spanLaneCount - lane) * 16 + 6}px` }}
          onClick={() => onSelect({ type: 'beat', id: beat.id })}
        >
          <span className="span-arrow">◀</span>
          <span className="span-name">
            {beat.done && <span className="check">✓</span>}
            {beat.name}
          </span>
          <span className="span-meta">
            {beat.start}–{beat.end}% ・ {estimatedChars(beat, project).toLocaleString()}字
          </span>
        </button>
      </div>
    )
  }

  const renderSubplot = (subplot: Subplot): JSX.Element => {
    const lane = subplotLanes.get(subplot.id) ?? 0
    return (
      <div
        key={subplot.id}
        className={`subplot ${isSelected(subplot.id) ? 'is-selected' : ''}`}
        style={{
          top: `${subplot.start}%`,
          height: `${Math.max(subplot.end - subplot.start, 0.4)}%`,
          left: `${lane * SUBPLOT_LANE_W}px`
        }}
      >
        <button
          type="button"
          className="subplot-band"
          style={{ background: subplot.color }}
          onClick={() => onSelect({ type: 'subplot', id: subplot.id })}
          onPointerDown={(e) => beginDrag(e, subplot, 'move', onMoveSubplot)}
          title={`${subplot.name} — ${subplot.start}〜${subplot.end}%`}
        >
          {/* 縦書きにすると細い帯のまま日本語の名前が読める */}
          <span className="subplot-name">{subplot.name}</span>
        </button>
        <span
          className="span-handle span-handle-top"
          onPointerDown={(e) => beginDrag(e, subplot, 'resize-start', onMoveSubplot)}
        />
        <span
          className="span-handle span-handle-bottom"
          onPointerDown={(e) => beginDrag(e, subplot, 'resize-end', onMoveSubplot)}
        />
      </div>
    )
  }

  // 背景をクリックしたときだけ選択を解除する。ラベルのクリックまで拾うと、
  // 子で選択した直後に親が打ち消してしまう。
  const clearOnBackground = (event: React.MouseEvent): void => {
    if (!(event.target as HTMLElement).closest('button')) onSelect(null)
  }

  return (
    <div className="timeline" onClick={clearOnBackground}>
      <div className="timeline-cap timeline-cap-start">はじまり</div>

      <div
        className="track"
        ref={trackRef}
        style={{ height: `${zoom}px` }}
        onDoubleClick={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('bar')) {
            onAddBeatAt(pctFromClientY(e.clientY))
          }
        }}
      >
        <div className="bar" title="ダブルクリックでビートを追加">
          {TICKS.map((t) => (
            <span key={t} className="bar-tick" style={{ top: `${t}%` }} />
          ))}
        </div>

        <div className="scale">
          {TICKS.filter((t) => t % 10 === 0).map((t) => (
            <span key={t} className="scale-label" style={{ top: `${t}%` }}>
              {t}%
            </span>
          ))}
        </div>

        <div className="points">{points.map(renderPoint)}</div>

        {project.subplots.length > 0 && <div className="subplots">{project.subplots.map(renderSubplot)}</div>}

        <div className="spans" style={{ marginLeft: `${spansOffset}px` }}>
          {spans.map(renderSpan)}
        </div>
      </div>

      <div className="timeline-cap timeline-cap-end">おわり</div>
    </div>
  )
}
