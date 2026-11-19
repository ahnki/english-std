import { useMemo } from 'react'
import { DAILY_GOAL, streakOf, summarize, todayStats } from './progressLogic'

// 홈 맨 위의 "오늘의 학습" 카드: 오늘 목표, 연속 학습일, 복습할 단어, 이어서 공부하기
export default function Today({ categories, folders, progress, daily, last, rebuilding, onStudy, onRebuild }) {
  const now = Date.now()
  const catName = (id) => categories.find((c) => c.id === id)?.name || id

  const summary = useMemo(() => summarize(progress, folders, now), [progress, folders, now])
  const today = todayStats(daily, now)
  const streak = streakOf(daily, now)
  const pct = Math.min(100, Math.round((today.total / DAILY_GOAL) * 100))

  // 복습할 단어가 많은 폴더 순서로 최대 5개
  const dueRows = summary.rows.filter((r) => r.due > 0).sort((a, b) => b.due - a.due).slice(0, 5)

  // 새 단어를 이어서 공부할 폴더: 마지막으로 공부한 폴더(새 단어가 남아 있으면) → 아니면 새 단어가 남은 첫 폴더
  const lastRow = last ? summary.rows.find((r) => r.cat === last.cat && r.folder === last.folder) : null
  const continueRow = lastRow && lastRow.fresh > 0 ? lastRow : summary.rows.find((r) => r.fresh > 0) || null

  const allDone = !dueRows.length && !continueRow

  return (
    <section className="card today">
      <div className="today-head">
        <h2 className="no-margin">오늘의 학습</h2>
        <span className={streak > 0 ? 'streak on' : 'streak'}>
          {streak > 0 ? `🔥 연속 ${streak}일` : '오늘 시작해 보세요'}
        </span>
      </div>

      <div className="goal">
        <div className="goal-line">
          <span>
            오늘 푼 문제 <strong>{today.total}</strong> / {DAILY_GOAL}
          </span>
          {today.total > 0 && <span className="muted small-text">정답률 {today.rate}%</span>}
        </div>
        <div className="bar"><div style={{ width: `${pct}%` }} /></div>
        {today.total >= DAILY_GOAL && <p className="msg good no-margin">오늘 목표를 채웠어요! 🎉</p>}
      </div>

      {rebuilding && <p className="muted small-text">공부 기록을 처음 한 번 정리하는 중이에요…</p>}

      <h3 className="sub">복습할 단어 {summary.dueTotal}개</h3>
      {dueRows.length === 0 ? (
        <p className="muted small-text no-margin">지금 복습할 단어가 없어요.</p>
      ) : (
        <ul className="today-list">
          {dueRows.map((r) => (
            <li key={`${r.cat}/${r.folder}`}>
              <span>
                {catName(r.cat)} · <strong>{r.name}</strong>
                <span className="muted"> 복습 {r.due}개</span>
              </span>
              <button type="button" className="link" onClick={() => onStudy(r.cat, r.folder, { role: '', focus: 'review' })}>복습하기</button>
            </li>
          ))}
        </ul>
      )}

      <h3 className="sub">새 단어 이어서 공부</h3>
      {continueRow ? (
        <ul className="today-list">
          <li>
            <span>
              {catName(continueRow.cat)} · <strong>{continueRow.name}</strong>
              <span className="muted"> 새 단어 {continueRow.fresh}개</span>
            </span>
            <button type="button" className="primary slim" onClick={() => onStudy(continueRow.cat, continueRow.folder, { focus: 'new' })}>
              공부하기
            </button>
          </li>
        </ul>
      ) : (
        <p className="muted small-text no-margin">{allDone ? '새로 공부할 단어를 모두 한 번 이상 공부했어요. 대단해요!' : '새로 공부할 단어가 없어요.'}</p>
      )}

      <p className="today-foot">
        <button type="button" className="link muted" onClick={onRebuild} disabled={rebuilding}>
          진도 다시 계산
        </button>
      </p>
    </section>
  )
}
