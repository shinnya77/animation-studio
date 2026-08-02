import type { Template } from './types'

/**
 * ブレイク・スナイダー・ビート・シート（BS2）。
 * 位置はスナイダーの原典（110ページ脚本を基準）を百分率に直したもの。
 */
const bs2: Template = {
  id: 'bs2',
  name: 'ブレイク・スナイダー・ビート・シート（BS2）',
  description:
    '15 のビートで構成する脚本術の定番。どこで何が起きるべきかが割合で決まっているので、長編の骨格を素早く組める。',
  beats: [
    {
      name: 'オープニング・イメージ',
      kind: 'point',
      start: 0,
      end: 0,
      act: 1,
      guide:
        '物語の第一印象。主人公が「変わる前」の状態を一枚の絵で見せる。ファイナル・イメージと対になるよう設計する。'
    },
    {
      name: 'セットアップ',
      kind: 'span',
      start: 0,
      end: 10,
      act: 1,
      guide:
        '日常世界、主人公の欠落、そして物語で解決されるべき問題を提示する。あとで効いてくる要素をここで全部並べておく。'
    },
    {
      name: 'テーマの提示',
      kind: 'point',
      start: 5,
      end: 5,
      act: 1,
      guide:
        '誰かが主人公に、この物語の主題を問いかける。主人公はまだその意味が分からない。ラストでこの問いに答えが出る。'
    },
    {
      name: 'きっかけ',
      kind: 'point',
      start: 10,
      end: 10,
      act: 1,
      guide: '日常を壊す出来事。外から飛び込んでくる報せ・事件・出会い。ここから物語が動き出す。'
    },
    {
      name: '悩みのとき',
      kind: 'span',
      start: 10,
      end: 20,
      act: 1,
      guide:
        '「行くべきか、行かざるべきか」。主人公がためらい、迷い、抵抗する区間。読者に「失うもの」を理解させる。'
    },
    {
      name: '第1ターニング・ポイント／第2幕へ',
      kind: 'point',
      start: 20,
      end: 20,
      act: 2,
      guide:
        '主人公が自分の意志で一歩を踏み出し、後戻りできなくなる。ここで舞台は「逆さまの世界」に切り替わる。'
    },
    {
      name: 'サブプロット／B ストーリー',
      kind: 'point',
      start: 22,
      end: 22,
      act: 2,
      guide:
        '新しい人物（恋人・相棒・師）が登場し、テーマを別の角度から語りはじめる。A ストーリーの息継ぎでもある。'
    },
    {
      name: 'お楽しみ',
      kind: 'span',
      start: 22,
      end: 50,
      act: 2,
      guide:
        '読者がこの物語に期待して買った場面そのもの。予告編に使われるところ。プロットの進行より「約束の履行」を優先する。'
    },
    {
      name: 'ミッドポイント',
      kind: 'point',
      start: 50,
      end: 50,
      act: 2,
      guide:
        '偽りの勝利、または偽りの敗北。物語の賭け金が跳ね上がり、ここを境に主人公は攻めから守りに回る。'
    },
    {
      name: '迫りくる悪いやつら',
      kind: 'span',
      start: 50,
      end: 75,
      act: 2,
      guide:
        '外の敵が組み直され、内側の疑念も膨らむ。仲間が離れ、逃げ場が一つずつ塞がれていく下降の区間。'
    },
    {
      name: 'すべてを失って',
      kind: 'point',
      start: 75,
      end: 75,
      act: 2,
      guide:
        '最大の喪失。師の死など「死の匂い」を置くと効く。主人公が抱えていた古い自分がここで終わる。'
    },
    {
      name: '心の暗闇',
      kind: 'span',
      start: 75,
      end: 80,
      act: 2,
      guide: '敗北を噛みしめる沈黙の時間。ここで主人公はテーマの答えに手が届く。'
    },
    {
      name: '第2ターニング・ポイント／第3幕へ',
      kind: 'point',
      start: 80,
      end: 80,
      act: 3,
      guide:
        'B ストーリーの人物やテーマの一言がきっかけで、主人公が答えを掴む。A と B が合流して解決策が生まれる。'
    },
    {
      name: 'フィナーレ',
      kind: 'span',
      start: 80,
      end: 99,
      act: 3,
      guide:
        '新しい自分で世界に立ち向かい、敵を倒し、壊れていた世界を作り直す。第2幕で仕込んだ伏線をすべて回収する。'
    },
    {
      name: 'ファイナル・イメージ',
      kind: 'point',
      start: 100,
      end: 100,
      act: 3,
      guide:
        'オープニング・イメージと対になる一枚。同じ構図で「どれだけ変わったか」を見せるのが最も効く。'
    }
  ]
}

const threeAct: Template = {
  id: 'three-act',
  name: '三幕構成',
  description: 'もっとも汎用的な骨格。BS2 より粗いので、話の形がまだ固まっていない段階の下書きに向く。',
  beats: [
    { name: '第一幕（状況設定）', kind: 'span', start: 0, end: 25, act: 1, guide: '世界と主人公、そして日常を壊す問題を提示する。' },
    { name: '発端の事件', kind: 'point', start: 10, end: 10, act: 1, guide: '物語を起動させる出来事。' },
    { name: 'プロットポイント 1', kind: 'point', start: 25, end: 25, act: 2, guide: '主人公が目的を定め、後戻りできない選択をする。' },
    { name: '第二幕前半（上昇）', kind: 'span', start: 25, end: 50, act: 2, guide: '手探りで前進し、小さな成功を重ねる。' },
    { name: 'ミッドポイント', kind: 'point', start: 50, end: 50, act: 2, guide: '真相の一部が明らかになり、賭け金が上がる。' },
    { name: '第二幕後半（下降）', kind: 'span', start: 50, end: 75, act: 2, guide: '反撃を受け、状況が悪化していく。' },
    { name: 'プロットポイント 2', kind: 'point', start: 75, end: 75, act: 3, guide: '最低の地点。ここから最後の決断が生まれる。' },
    { name: '第三幕（解決）', kind: 'span', start: 75, end: 100, act: 3, guide: '対決と決着、そして後日談。' },
    { name: 'クライマックス', kind: 'point', start: 90, end: 90, act: 3, guide: '主題に決着をつける最大の対決。' },
    { name: '結末', kind: 'point', start: 100, end: 100, act: 3, guide: '変化した世界を見せて閉じる。' }
  ]
}

const kishotenketsu: Template = {
  id: 'kishotenketsu',
  name: '起承転結',
  description: '対立に頼らず「転」の落差で読ませる四段構成。短編や日常もの、連作の一話単位に向く。',
  beats: [
    { name: '起', kind: 'span', start: 0, end: 25, act: 1, guide: '人物と状況を置く。ここでは何も壊れていなくてよい。' },
    { name: '発端', kind: 'point', start: 5, end: 5, act: 1, guide: '読者が「この話は何の話か」を掴む一点。' },
    { name: '承', kind: 'span', start: 25, end: 60, act: 2, guide: '起で置いたものを掘り下げ、日常を積み重ねる。' },
    { name: '転', kind: 'span', start: 60, end: 85, act: 2, guide: '視点や前提がひっくり返る。ここまでの意味が変わる一手を置く。' },
    { name: '転換点', kind: 'point', start: 60, end: 60, act: 2, guide: '「転」の入口。読者の予測を外す瞬間。' },
    { name: '結', kind: 'span', start: 85, end: 100, act: 3, guide: '転を踏まえた新しい均衡。説明しすぎずに閉じる。' },
    { name: '余韻', kind: 'point', start: 100, end: 100, act: 3, guide: '最後の一行。読後感を決める。' }
  ]
}

const heroJourney: Template = {
  id: 'hero-journey',
  name: 'ヒーローズ・ジャーニー',
  description: 'ボグラー版 12 ステージ。冒険譚・成長譚・ファンタジーの長編で骨格が安定する。',
  beats: [
    { name: '1. 日常世界', kind: 'span', start: 0, end: 8, act: 1, guide: '主人公が何を持ち、何を欠いているかを見せる。' },
    { name: '2. 冒険への誘い', kind: 'span', start: 8, end: 12, act: 1, guide: '日常を離れる理由が差し出される。' },
    { name: '3. 冒険の拒否', kind: 'span', start: 12, end: 17, act: 1, guide: 'ためらい。恐れの正体を読者に伝える。' },
    { name: '4. 賢者との出会い', kind: 'span', start: 17, end: 22, act: 1, guide: '導き手が現れ、必要な知恵や道具を渡す。' },
    { name: '5. 第一関門突破', kind: 'span', start: 22, end: 28, act: 2, guide: '境界を越え、特別な世界に入る。' },
    { name: '6. 試練・仲間・敵', kind: 'span', start: 28, end: 45, act: 2, guide: '新しい世界の規則を学びながら、関係を作る。' },
    { name: '7. 最も危険な場所への接近', kind: 'span', start: 45, end: 55, act: 2, guide: '中心へ向かう準備。緊張を上げる。' },
    { name: '8. 最大の試練', kind: 'span', start: 55, end: 65, act: 2, guide: '死と再生。一度は敗れる、あるいは象徴的に死ぬ。' },
    { name: '9. 報酬', kind: 'span', start: 65, end: 72, act: 2, guide: '剣を手にする。ただし代償がある。' },
    { name: '10. 帰路', kind: 'span', start: 72, end: 82, act: 3, guide: '追撃を受けながら日常世界へ向かう。' },
    { name: '11. 復活', kind: 'span', start: 82, end: 92, act: 3, guide: '最後の対決。主人公が本当に変わったことを証明する。' },
    { name: '12. 宝を持っての帰還', kind: 'span', start: 92, end: 100, act: 3, guide: '持ち帰ったもので日常世界を作り直す。' }
  ]
}

export const TEMPLATES: Template[] = [bs2, threeAct, kishotenketsu, heroJourney]

export function getTemplate(id: string): Template {
  return TEMPLATES.find((t) => t.id === id) ?? bs2
}
