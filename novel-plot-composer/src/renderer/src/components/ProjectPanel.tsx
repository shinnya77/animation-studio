import { useState } from 'react'
import type { Character, Project, Selection, Subplot } from '@/lib/types'
import { TEMPLATES } from '@/lib/templates'
import { progress, writtenChars } from '@/lib/project'

type Tab = 'work' | 'cast' | 'subplots'

interface Props {
  project: Project
  selection: Selection
  onUpdateProject: (patch: Partial<Project>, label?: string) => void
  onChangeTemplate: (templateId: string) => void
  onAddCharacter: () => void
  onUpdateCharacter: (id: string, patch: Partial<Character>, label?: string) => void
  onDeleteCharacter: (id: string) => void
  onAddSubplot: () => void
  onUpdateSubplot: (id: string, patch: Partial<Subplot>, label?: string) => void
  onSelect: (selection: Selection) => void
}

export function ProjectPanel(props: Props): JSX.Element {
  const { project, onUpdateProject } = props
  const [tab, setTab] = useState<Tab>('work')
  const stats = progress(project)
  const written = writtenChars(project)

  return (
    <aside className="panel">
      <nav className="tabs">
        <button type="button" className={tab === 'work' ? 'is-on' : ''} onClick={() => setTab('work')}>
          作品
        </button>
        <button type="button" className={tab === 'cast' ? 'is-on' : ''} onClick={() => setTab('cast')}>
          人物 {project.characters.length > 0 && <em>{project.characters.length}</em>}
        </button>
        <button type="button" className={tab === 'subplots' ? 'is-on' : ''} onClick={() => setTab('subplots')}>
          サブプロット {project.subplots.length > 0 && <em>{project.subplots.length}</em>}
        </button>
      </nav>

      {tab === 'work' && (
        <div className="panel-body">
          <label className="field">
            <span>タイトル</span>
            <input
              value={project.title}
              onChange={(e) => onUpdateProject({ title: e.target.value }, 'title')}
              placeholder="無題のプロット"
            />
          </label>

          <label className="field">
            <span>ログライン</span>
            <textarea
              className="short"
              value={project.logline}
              placeholder="誰が、何を求めて、何に阻まれるか。一〜二文で。"
              onChange={(e) => onUpdateProject({ logline: e.target.value }, 'logline')}
            />
          </label>

          <label className="field">
            <span>テーマ</span>
            <input
              value={project.theme}
              placeholder="この物語が答えを出す問い"
              onChange={(e) => onUpdateProject({ theme: e.target.value }, 'theme')}
            />
          </label>

          <label className="field">
            <span>ジャンル</span>
            <input
              value={project.genre}
              placeholder="現代ファンタジー / 青春 / ミステリ など"
              onChange={(e) => onUpdateProject({ genre: e.target.value }, 'genre')}
            />
          </label>

          <label className="field">
            <span>構成テンプレート</span>
            <select value={project.templateId} onChange={(e) => props.onChangeTemplate(e.target.value)}>
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <p className="hint">{TEMPLATES.find((t) => t.id === project.templateId)?.description}</p>

          <label className="field">
            <span>想定文字数</span>
            <input
              type="number"
              min={1000}
              step={1000}
              value={project.targetChars}
              onChange={(e) => onUpdateProject({ targetChars: Math.max(0, Number(e.target.value)) })}
            />
          </label>

          <div className="stats">
            <div className="stat">
              <em>{stats.done}</em>／{stats.total} ビート
              <div className="meter">
                <span style={{ width: `${stats.ratio * 100}%` }} />
              </div>
            </div>
            <div className="stat">
              <em>{written.toLocaleString()}</em> 字（メモ合計）
              <div className="meter">
                <span
                  style={{
                    width: `${Math.min(100, project.targetChars ? (written / project.targetChars) * 100 : 0)}%`
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'cast' && (
        <div className="panel-body">
          {project.characters.length === 0 && <p className="hint">登場人物を登録すると、各ビートに紐づけられます。</p>}
          {project.characters.map((c) => (
            <div key={c.id} className="card">
              <div className="card-head">
                <input
                  type="color"
                  value={c.color}
                  onChange={(e) => props.onUpdateCharacter(c.id, { color: e.target.value })}
                />
                <input
                  className="card-title"
                  value={c.name}
                  onChange={(e) => props.onUpdateCharacter(c.id, { name: e.target.value }, `cast-name:${c.id}`)}
                />
                <button type="button" className="icon danger" onClick={() => props.onDeleteCharacter(c.id)}>
                  ×
                </button>
              </div>
              <input
                value={c.role}
                placeholder="役割（主人公 / 相棒 / 敵対者…）"
                onChange={(e) => props.onUpdateCharacter(c.id, { role: e.target.value }, `cast-role:${c.id}`)}
              />
              <textarea
                className="short"
                value={c.note}
                placeholder="欲しているもの、必要としているもの、変化"
                onChange={(e) => props.onUpdateCharacter(c.id, { note: e.target.value }, `cast-note:${c.id}`)}
              />
            </div>
          ))}
          <button type="button" onClick={props.onAddCharacter}>
            ＋ 人物を追加
          </button>
        </div>
      )}

      {tab === 'subplots' && (
        <div className="panel-body">
          {project.subplots.length === 0 && (
            <p className="hint">B ストーリーなど、本筋と並走する線をタイムライン上に帯で重ねられます。</p>
          )}
          {project.subplots.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`card as-button ${props.selection?.id === s.id ? 'is-selected' : ''}`}
              onClick={() => props.onSelect({ type: 'subplot', id: s.id })}
            >
              <span className="swatch" style={{ background: s.color }} />
              <span className="card-title-static">{s.name}</span>
              <span className="range">
                {s.start}–{s.end}%
              </span>
            </button>
          ))}
          <button type="button" onClick={props.onAddSubplot}>
            ＋ サブプロットを追加
          </button>
        </div>
      )}
    </aside>
  )
}
