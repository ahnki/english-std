import { useState } from 'react'
import AddWord from './AddWord.jsx'
import AddExcel from './AddExcel.jsx'
import ImportPage from './ImportPage.jsx'

// 데이터 추가 화면: 한 개씩 / 엑셀로 여러 개 / 처음 가져오기(고급)
export default function AddData({ user, defaultCat, defaultFolder, initialMode = 'excel', onOpenFolder }) {
  const [mode, setMode] = useState(initialMode)
  const modes = [
    ['excel', '엑셀로 여러 개'],
    ['one', '한 개씩'],
    ['legacy', '처음 가져오기 (고급)'],
  ]
  return (
    <div>
      <div className="seg add-seg">
        {modes.map(([id, label]) => (
          <button type="button" key={id} className={mode === id ? 'on' : ''} onClick={() => setMode(id)}>{label}</button>
        ))}
      </div>
      {mode === 'excel' && <AddExcel user={user} onOpenFolder={onOpenFolder} />}
      {mode === 'one' && (
        <div className="form-narrow">
          <AddWord user={user} defaultCat={defaultCat} defaultFolder={defaultFolder} onOpenFolder={onOpenFolder} />
        </div>
      )}
      {mode === 'legacy' && (
        <>
          <div className="warn">
            <p>
              <strong>예전 양식(처음 한 번 전체를 가져올 때 쓰던 방식)</strong>이에요. 이미 있는 폴더를 <strong>덮어쓰기</strong>하면 그 폴더의 수정 내용과 학습 기록이 지워져요.
              새 데이터를 이어 붙일 때는 <strong>엑셀로 여러 개</strong>를 쓰세요.
            </p>
          </div>
          <ImportPage user={user} />
        </>
      )}
    </div>
  )
}
