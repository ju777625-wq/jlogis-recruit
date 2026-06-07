import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

const STAGES = ['서류접수', '전화상담', '면접', '동승심사', '채용완료', '불합격']
const STAGE_COLORS = {
  '서류접수': ['#E6F1FB', '#185FA5'],
  '전화상담': ['#FAEEDA', '#BA7517'],
  '면접': ['#EEEDFE', '#534AB7'],
  '동승심사': ['#E1F5EE', '#0F6E56'],
  '채용완료': ['#EAF3DE', '#3B6D11'],
  '불합격': ['#FCEBEB', '#A32D2D'],
}
const POSITIONS = ['새벽수거', '세탁물수거', '가구배송/조립', '기타']
const CAREER_TYPES = ['신입', '경력']
const TRUCK_OPTIONS = ['없음', '있음']
const STATUS_OPTIONS = ['', '재통화', '면접예정', '지원취소', '재면접의사', '결정통보다시', '면접연기']
const STATUS_COLORS = {
  '재통화': ['#FAEEDA', '#BA7517'],
  '면접예정': ['#EEEDFE', '#534AB7'],
  '지원취소': ['#FCEBEB', '#A32D2D'],
  '재면접의사': ['#E6F1FB', '#185FA5'],
  '결정통보다시': ['#E1F5EE', '#0F6E56'],
  '면접연기': ['#F1EFE8', '#5F5E5A'],
}
const VIEWS = [
  { key: '전체', label: '전체' },
  { key: 's:재통화', label: '재통화' },
  { key: 's:면접예정', label: '면접예정' },
  { key: 's:면접연기', label: '면접연기' },
  { key: 's:지원취소', label: '지원취소' },
  { key: 'undecided', label: '면접후 미결정' },
]
const CALL_RESULTS = ['연결됨', '부재중', '콜백 예정', '거절', '기타']
const CALL_COLORS = {
  '연결됨': ['#E1F5EE', '#0F6E56'],
  '부재중': ['#FAEEDA', '#BA7517'],
  '콜백 예정': ['#EEEDFE', '#534AB7'],
  '거절': ['#FCEBEB', '#A32D2D'],
  '기타': ['#F1EFE8', '#5F5E5A'],
}

// 전화번호 자동 하이픈
function formatPhone(v) {
  const n = (v || '').replace(/[^0-9]/g, '').slice(0, 11)
  if (n.length < 4) return n
  if (n.length < 7) return n.slice(0, 3) + '-' + n.slice(3)
  if (n.length < 11) return n.slice(0, 3) + '-' + n.slice(3, 6) + '-' + n.slice(6)
  return n.slice(0, 3) + '-' + n.slice(3, 7) + '-' + n.slice(7)
}

export default function App() {
  const [applicants, setApplicants] = useState([])
  const [calls, setCalls] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [view, setView] = useState('전체')
  const [screen, setScreen] = useState('list') // 'list' | 'calendar'
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('info')
  const [showModal, setShowModal] = useState(false)
  const [showCallForm, setShowCallForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data: ap, error: e1 } = await supabase
      .from('applicants').select('*').order('created_at', { ascending: false })
    const { data: cl, error: e2 } = await supabase
      .from('calls').select('*').order('call_date', { ascending: false })
    if (e1 || e2) {
      setError((e1 || e2).message)
    } else {
      setApplicants(ap || [])
      setCalls(cl || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    const ch = supabase
      .channel('realtime-recruit')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applicants' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, loadData)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [loadData])

  const selected = applicants.find(a => a.id === selectedId)
  const selectedCalls = calls.filter(c => c.applicant_id === selectedId)

  function matchView(a) {
    if (view === '전체') return true
    if (view.startsWith('s:')) return a.status === view.slice(2)
    if (view.startsWith('stage:')) return a.stage === view.slice(6)
    if (view === 'undecided') return a.stage === '면접'
    return true
  }

  const filtered = applicants.filter(a => {
    const mq = !search || a.name.includes(search) || (a.phone || '').includes(search)
    return mq && matchView(a)
  })

  function viewCount(key) {
    return applicants.filter(a => {
      if (key === '전체') return true
      if (key.startsWith('s:')) return a.status === key.slice(2)
      if (key.startsWith('stage:')) return a.stage === key.slice(6)
      if (key === 'undecided') return a.stage === '면접'
      return false
    }).length
  }

  async function addApplicant(form) {
    // 중복 체크 (연락처)
    const phoneDigits = (form.phone || '').replace(/[^0-9]/g, '')
    const dup = applicants.find(a => (a.phone || '').replace(/[^0-9]/g, '') === phoneDigits && phoneDigits)
    if (dup) {
      if (!confirm(`이미 등록된 연락처입니다.\n(${dup.name} / ${dup.phone})\n그래도 등록할까요?`)) return
    }
    const today = new Date().toISOString().slice(0, 10)
    const payload = { ...form, stage_dates: { [form.stage || '서류접수']: today } }
    const { data, error } = await supabase.from('applicants').insert([payload]).select()
    if (error) { alert('등록 실패: ' + error.message); return }
    await loadData()
    if (data && data[0]) { setSelectedId(data[0].id); setActiveTab('info') }
    setShowModal(false)
  }

  async function updateField(id, field, value) {
    setApplicants(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a))
    await supabase.from('applicants').update({ [field]: value }).eq('id', id)
  }

  // 단계 변경: 단계 + 그 단계로 넘긴 날짜 기록
  async function changeStage(a, newStage) {
    const today = new Date().toISOString().slice(0, 10)
    const sd = { ...(a.stage_dates || {}) }
    if (!sd[newStage]) sd[newStage] = today
    setApplicants(prev => prev.map(x => x.id === a.id ? { ...x, stage: newStage, stage_dates: sd } : x))
    await supabase.from('applicants').update({ stage: newStage, stage_dates: sd }).eq('id', a.id)
  }

  async function deleteApplicant(id) {
    if (!confirm('이 지원자를 삭제하시겠습니까? 통화 이력도 함께 삭제됩니다.')) return
    await supabase.from('applicants').delete().eq('id', id)
    setSelectedId(null)
    await loadData()
  }

  async function addCall(applicant_id, form) {
    const { error } = await supabase.from('calls').insert([{ applicant_id, ...form }])
    if (error) { alert('저장 실패: ' + error.message); return }
    setShowCallForm(false)
    await loadData()
  }

  async function deleteCall(id) {
    await supabase.from('calls').delete().eq('id', id)
    await loadData()
  }

  const detailOpen = !!selected

  return (
    <div className={'app' + ((detailOpen || screen === 'calendar') ? ' detail-open' : '')}>
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>👥 구직자 관리</h2>
          <div className="search-box">
            <input placeholder="이름, 연락처 검색…" value={search}
              onChange={e => setSearch(e.target.value)} />
          </div>
          <button className="add-btn" onClick={() => setShowModal(true)}>+ 지원자 등록</button>
          <div className="screen-toggle">
            <button className={screen === 'list' ? 'on' : ''} onClick={() => setScreen('list')}>📋 명단</button>
            <button className={screen === 'calendar' ? 'on' : ''} onClick={() => { setScreen('calendar'); setSelectedId(null) }}>📅 달력</button>
          </div>
        </div>

        <div className="stage-filter">
          <p>모아보기</p>
          <div className="filter-row">
            {VIEWS.map(v => (
              <span key={v.key} className={'stage-pill' + (view === v.key ? ' active' : '')}
                onClick={() => setView(v.key)}>
                {v.label} {viewCount(v.key)}
              </span>
            ))}
          </div>
          <p style={{ marginTop: 8 }}>채용 단계별</p>
          <div className="filter-row">
            {STAGES.map(s => {
              const [bg, fg] = STAGE_COLORS[s]
              return (
                <span key={s} className={'stage-pill' + (view === 'stage:' + s ? ' active' : '')}
                  style={{ background: bg, color: fg, borderColor: view === 'stage:' + s ? '#888' : bg }}
                  onClick={() => setView('stage:' + s)}>
                  {s} {viewCount('stage:' + s)}
                </span>
              )
            })}
          </div>
        </div>

        <div className="applicant-list">
          {loading && <div className="hint">불러오는 중…</div>}
          {error && <div className="hint err">연결 오류: {error}</div>}
          {!loading && !filtered.length && <div className="hint">해당 지원자 없음</div>}
          {filtered.map(a => {
            const [bg, fg] = STAGE_COLORS[a.stage] || ['#eee', '#333']
            const sc = STATUS_COLORS[a.status]
            return (
              <div key={a.id} className={'applicant-card row' + (a.id === selectedId ? ' selected' : '')}
                onClick={() => { setSelectedId(a.id); setActiveTab('info') }}>
                <span className="c-name">{a.name}</span>
                {a.status && sc ? (
                  <span className="c-status tag" style={{ background: sc[0], color: sc[1], fontWeight: 600 }}>{a.status}</span>
                ) : (
                  <span className="c-status tag" style={{ background: bg, color: fg }}>{a.stage}</span>
                )}
                <span className="c-age">{a.age ? a.age + '세' : ''}</span>
                <span className="c-region">{a.region || ''}</span>
                <span className="c-pos">{a.position || ''}</span>
                <span className="c-truck">{a.has_truck === '있음' ? '🚚' : ''}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="main">
        {screen === 'calendar' ? (
          <CalendarView applicants={applicants} onPick={(id) => { setScreen('list'); setSelectedId(id); setActiveTab('info') }} onBack={() => setScreen('list')} />
        ) : !selected ? (
          <div className="empty">지원자를 선택하세요</div>
        ) : (
          <>
            <div className="main-header">
              <button className="back-btn" onClick={() => setSelectedId(null)}>← 목록</button>
              <div className="row-between">
                <div>
                  <div className="detail-name">{selected.name}</div>
                  <div className="detail-meta">
                    <span><a className="phone-link" href={'tel:' + (selected.phone || '')}>📞 {selected.phone}</a></span>
                    <span>📍 {selected.region || '-'}</span>
                    <span>💼 {selected.position || '-'}</span>
                  </div>
                  {selected.status && STATUS_COLORS[selected.status] && (
                    <div style={{ marginTop: 6 }}>
                      <span className="tag" style={{ background: STATUS_COLORS[selected.status][0], color: STATUS_COLORS[selected.status][1], fontWeight: 600, fontSize: 13, padding: '3px 10px' }}>{selected.status}</span>
                    </div>
                  )}
                </div>
                <button className="del-btn" onClick={() => deleteApplicant(selected.id)}>🗑 삭제</button>
              </div>
              <div className="stage-bar">
                {STAGES.map((s, i) => {
                  const idx = STAGES.indexOf(selected.stage)
                  const cls = i < idx ? 'done' : i === idx ? 'current' : 'future'
                  const d = (selected.stage_dates || {})[s]
                  return (
                    <div key={s} className={'stage-step ' + cls}
                      onClick={() => changeStage(selected, s)}>
                      <div>{s}</div>
                      {d && <div className="stage-date">{d.slice(5)}</div>}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="tabs">
              <div className={'tab' + (activeTab === 'info' ? ' active' : '')}
                onClick={() => setActiveTab('info')}>기본 정보</div>
              <div className={'tab' + (activeTab === 'stage' ? ' active' : '')}
                onClick={() => setActiveTab('stage')}>현재 단계 할 일</div>
              <div className={'tab' + (activeTab === 'calls' ? ' active' : '')}
                onClick={() => setActiveTab('calls')}>통화 이력 ({selectedCalls.length})</div>
            </div>

            <div className="tab-content">
              {activeTab === 'info' ? (
                <InfoTab a={selected} onChange={updateField} />
              ) : activeTab === 'stage' ? (
                <StageTab a={selected} onChange={updateField} />
              ) : (
                <CallsTab
                  calls={selectedCalls}
                  showForm={showCallForm}
                  setShowForm={setShowCallForm}
                  onAdd={(form) => addCall(selected.id, form)}
                  onDelete={deleteCall}
                />
              )}
            </div>
          </>
        )}
      </div>

      {showModal && <AddModal onClose={() => setShowModal(false)} onSave={addApplicant} existing={applicants} />}
    </div>
  )
}

// 현재 단계에 맞는 할 일 입력칸만 보여주는 탭
function StageTab({ a, onChange }) {
  const stage = a.stage
  return (
    <>
      <p className="section-title">현재 단계: {stage}</p>
      {stage === '전화상담' && (
        <>
          <div className="info-grid">
            <DateTimeField label="전화상담 일시" value={a.consult_at}
              onSave={v => onChange(a.id, 'consult_at', v || null)} />
            <Field label="상담 방법/장소" value={a.consult_place} placeholder="예: 유선"
              onSave={v => onChange(a.id, 'consult_place', v)} />
          </div>
          {a.consult_at && (
            <a className="cal-btn" href={makeCalUrl(a, 'consult')} target="_blank" rel="noopener noreferrer">
              📅 구글 캘린더에 전화상담 일정 추가
            </a>
          )}
        </>
      )}
      {stage === '면접' && (
        <>
          <div className="info-grid">
            <DateTimeField label="면접 일시" value={a.interview_at}
              onSave={v => onChange(a.id, 'interview_at', v || null)} />
            <Field label="면접 장소" value={a.interview_place} placeholder="예: 본사 2층"
              onSave={v => onChange(a.id, 'interview_place', v)} />
          </div>
          {a.interview_at && (
            <a className="cal-btn" href={makeCalUrl(a, 'interview')} target="_blank" rel="noopener noreferrer">
              📅 구글 캘린더에 면접 일정 추가
            </a>
          )}
        </>
      )}
      {stage === '동승심사' && (
        <div className="info-item full">
          <label>동승심사 내용</label>
          <textarea defaultValue={a.ride_review} placeholder="동승심사 결과, 특이사항 등"
            key={'rr2' + a.id} onBlur={e => onChange(a.id, 'ride_review', e.target.value)} />
        </div>
      )}
      {(stage === '서류접수' || stage === '채용완료' || stage === '불합격') && (
        <div className="hint" style={{ textAlign: 'left', padding: '8px 0' }}>
          이 단계에서는 별도 입력 항목이 없습니다. 상단 단계바를 눌러 단계를 옮기거나, '기본 정보' 탭에서 내용을 수정하세요.
        </div>
      )}
      <div className="info-item full" style={{ marginTop: 14 }}>
        <label>메모</label>
        <textarea defaultValue={a.note} key={'note2' + a.id}
          onBlur={e => onChange(a.id, 'note', e.target.value)} />
      </div>
    </>
  )
}

function InfoTab({ a, onChange }) {
  return (
    <>
      <p className="section-title">구직자 상태</p>
      <div className="info-item full">
        <select value={a.status || ''} onChange={e => onChange(a.id, 'status', e.target.value)}>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s === '' ? '상태 없음' : s}</option>)}
        </select>
      </div>

      <p className="section-title" style={{ marginTop: 18 }}>기본 정보</p>
      <div className="info-grid">
        <Field label="이름" value={a.name} onSave={v => onChange(a.id, 'name', v)} />
        <PhoneField label="연락처" value={a.phone} onSave={v => onChange(a.id, 'phone', v)} />
        <Field label="나이" value={a.age} type="number" placeholder="예: 45"
          onSave={v => onChange(a.id, 'age', v ? Number(v) : null)} />
        <Field label="주거지" value={a.region} placeholder="예: 서울 강서"
          onSave={v => onChange(a.id, 'region', v)} />
        <ComboField label="지원 직종" value={a.position} options={POSITIONS}
          onSave={v => onChange(a.id, 'position', v)} />
        <SelectField label="경력 구분" value={a.career_type || '신입'} options={CAREER_TYPES}
          onSave={v => onChange(a.id, 'career_type', v)} />
        <Field label="경력 연수(년)" value={a.career_years} type="number" placeholder="예: 3"
          onSave={v => onChange(a.id, 'career_years', v ? Number(v) : 0)} />
        <SelectField label="트럭 소유" value={a.has_truck || '없음'} options={TRUCK_OPTIONS}
          onSave={v => onChange(a.id, 'has_truck', v)} />
        <Field label="차종" value={a.truck_type} placeholder="예: 1톤 탑차"
          onSave={v => onChange(a.id, 'truck_type', v)} />
      </div>

      <p className="section-title" style={{ marginTop: 18 }}>기타</p>
      <div className="info-item full">
        <label>기타 주요 경력</label>
        <textarea defaultValue={a.career_note} placeholder="이전 직장, 보유 자격증 등"
          key={'cn' + a.id} onBlur={e => onChange(a.id, 'career_note', e.target.value)} />
      </div>
      <div className="info-item full">
        <label>메모</label>
        <textarea defaultValue={a.note} key={'nt' + a.id}
          onBlur={e => onChange(a.id, 'note', e.target.value)} />
      </div>
    </>
  )
}

function Field({ label, value, placeholder, type, onSave }) {
  return (
    <div className="info-item">
      <label>{label}</label>
      <input type={type || 'text'} defaultValue={value ?? ''} placeholder={placeholder}
        key={String(value)} onBlur={e => onSave(e.target.value)} />
    </div>
  )
}

// 전화번호 전용: 입력하는 동안 자동으로 하이픈
function PhoneField({ label, value, onSave }) {
  const [v, setV] = useState(value || '')
  useEffect(() => { setV(value || '') }, [value])
  return (
    <div className="info-item">
      <label>{label}</label>
      <input type="tel" value={v}
        onChange={e => setV(formatPhone(e.target.value))}
        onBlur={() => onSave(v)} placeholder="010-0000-0000" />
    </div>
  )
}

function SelectField({ label, value, options, onSave }) {
  return (
    <div className="info-item">
      <label>{label}</label>
      <select value={value} onChange={e => onSave(e.target.value)}>
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  )
}

function ComboField({ label, value, options, onSave }) {
  const known = options.includes(value)
  const [custom, setCustom] = useState(!known && !!value)
  return (
    <div className="info-item">
      <label>{label}</label>
      {!custom ? (
        <select value={known ? value : ''} onChange={e => {
          if (e.target.value === '__direct__') { setCustom(true) }
          else onSave(e.target.value)
        }}>
          {options.map(o => <option key={o}>{o}</option>)}
          <option value="__direct__">+ 직접 입력</option>
        </select>
      ) : (
        <input defaultValue={known ? '' : (value || '')} placeholder="직접 입력"
          autoFocus onBlur={e => { onSave(e.target.value); if (!e.target.value) setCustom(false) }} />
      )}
    </div>
  )
}

// 날짜 + 30분 단위 시간 선택
function DateTimeField({ label, value, onSave }) {
  const d = value ? new Date(value) : null
  const pad = n => String(n).padStart(2, '0')
  const datePart = d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : ''
  const timePart = d ? `${pad(d.getHours())}:${pad(Math.floor(d.getMinutes() / 30) * 30)}` : ''

  function emit(dateStr, timeStr) {
    if (!dateStr || !timeStr) { onSave(''); return }
    const iso = new Date(`${dateStr}T${timeStr}`).toISOString()
    onSave(iso)
  }

  const TIMES = []
  for (let h = 6; h <= 22; h++) {
    TIMES.push(`${pad(h)}:00`)
    TIMES.push(`${pad(h)}:30`)
  }

  return (
    <>
      <div className="info-item">
        <label>{label} (날짜)</label>
        <input type="date" defaultValue={datePart} key={'d' + datePart}
          onChange={e => emit(e.target.value, timePart || '09:00')} />
      </div>
      <div className="info-item">
        <label>{label} (시간)</label>
        <select value={timePart} onChange={e => emit(datePart || new Date().toISOString().slice(0, 10), e.target.value)}>
          <option value="">선택</option>
          {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
    </>
  )
}

function CalendarView({ applicants, onPick, onBack }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })

  // 날짜별 일정 모으기
  const events = {}
  function add(dateKey, ev) { (events[dateKey] = events[dateKey] || []).push(ev) }
  applicants.forEach(a => {
    if (a.interview_at) {
      const d = new Date(a.interview_at)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      add(key, { id: a.id, name: a.name, type: '면접', time: hm(d) })
    }
    if (a.consult_at) {
      const d = new Date(a.consult_at)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      add(key, { id: a.id, name: a.name, type: '전화상담', time: hm(d) })
    }
  })

  const first = new Date(cursor.y, cursor.m, 1)
  const startDow = first.getDay()
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const today = new Date()
  const isToday = d => d === today.getDate() && cursor.m === today.getMonth() && cursor.y === today.getFullYear()

  function move(diff) {
    let m = cursor.m + diff, y = cursor.y
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setCursor({ y, m })
  }

  const DOW = ['일', '월', '화', '수', '목', '금', '토']

  return (
    <div className="cal-wrap">
      <button className="back-btn" onClick={onBack}>← 명단</button>
      <div className="cal-head">
        <button onClick={() => move(-1)}>‹</button>
        <span className="cal-title">{cursor.y}년 {cursor.m + 1}월</span>
        <button onClick={() => move(1)}>›</button>
        <button className="cal-today" onClick={() => { const d = new Date(); setCursor({ y: d.getFullYear(), m: d.getMonth() }) }}>오늘</button>
      </div>
      <div className="cal-legend">
        <span><i className="lg lg-iv" /> 면접</span>
        <span><i className="lg lg-cs" /> 전화상담</span>
      </div>
      <div className="cal-grid cal-dow">
        {DOW.map((d, i) => <div key={d} className={'cal-dowcell' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '')}>{d}</div>)}
      </div>
      <div className="cal-grid cal-body">
        {cells.map((d, i) => {
          const key = d ? `${cursor.y}-${cursor.m}-${d}` : 'e' + i
          const evs = d ? (events[key] || []) : []
          return (
            <div key={key} className={'cal-cell' + (d && isToday(d) ? ' today' : '') + (!d ? ' empty' : '')}>
              {d && <div className={'cal-daynum' + (i % 7 === 0 ? ' sun' : i % 7 === 6 ? ' sat' : '')}>{d}</div>}
              {evs.map((ev, j) => (
                <div key={j} className={'cal-ev ' + (ev.type === '면접' ? 'iv' : 'cs')}
                  onClick={() => onPick(ev.id)} title={ev.type + ' ' + ev.name}>
                  {ev.time} {ev.name}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function hm(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function makeCalUrl(a, kind) {
  const at = kind === 'consult' ? a.consult_at : a.interview_at
  const place = kind === 'consult' ? a.consult_place : a.interview_place
  const label = kind === 'consult' ? '전화상담' : '면접'
  const start = new Date(at)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  const fmt = dt => {
    const pad = n => String(n).padStart(2, '0')
    return dt.getUTCFullYear() + pad(dt.getUTCMonth() + 1) + pad(dt.getUTCDate()) +
      'T' + pad(dt.getUTCHours()) + pad(dt.getUTCMinutes()) + '00Z'
  }
  const title = encodeURIComponent(`[${label}] ${a.name} (${a.position || ''})`)
  const dates = `${fmt(start)}/${fmt(end)}`
  const details = encodeURIComponent(
    `지원자: ${a.name}\n연락처: ${a.phone || ''}\n지원직종: ${a.position || ''}\n나이: ${a.age || ''}\n트럭: ${a.has_truck || ''} ${a.truck_type || ''}`
  )
  const loc = encodeURIComponent(place || '')
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}&location=${loc}`
}

function CallsTab({ calls, showForm, setShowForm, onAdd, onDelete }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [result, setResult] = useState('연결됨')
  const [memo, setMemo] = useState('')
  const [next, setNext] = useState('')

  function submit() {
    onAdd({ call_date: date, result, memo, next_action: next })
    setMemo(''); setNext('')
  }

  return (
    <>
      <p className="section-title">통화 이력</p>
      <div className="call-log">
        {!calls.length && <div className="hint">통화 이력이 없습니다</div>}
        {calls.map(c => {
          const [bg, fg] = CALL_COLORS[c.result] || ['#eee', '#555']
          return (
            <div key={c.id} className="call-entry">
              <div className="call-header">
                <span className="call-date">{c.call_date}</span>
                <div className="row-gap">
                  <span className="call-result" style={{ background: bg, color: fg }}>{c.result}</span>
                  <button className="x-btn" onClick={() => onDelete(c.id)}>✕</button>
                </div>
              </div>
              <div className="call-memo">{c.memo || '메모 없음'}</div>
              {c.next_action && <div className="next-action">→ 다음 액션: {c.next_action}</div>}
            </div>
          )
        })}
      </div>

      {!showForm ? (
        <button className="add-btn" onClick={() => setShowForm(true)}>📞 통화 기록 추가</button>
      ) : (
        <div className="call-form">
          <div className="form-row">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            <select value={result} onChange={e => setResult(e.target.value)}>
              {CALL_RESULTS.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <textarea placeholder="통화 내용 메모…" value={memo} onChange={e => setMemo(e.target.value)} />
          <input placeholder="다음 액션 (선택)" value={next} onChange={e => setNext(e.target.value)} />
          <div className="form-btns">
            <button className="cancel-btn" onClick={() => setShowForm(false)}>취소</button>
            <button className="save-btn" onClick={submit}>저장</button>
          </div>
        </div>
      )}
    </>
  )
}

function AddModal({ onClose, onSave, existing }) {
  const [f, setF] = useState({
    name: '', phone: '', age: '', region: '', position: '새벽수거',
    career_type: '신입', career_years: '', career_note: '',
    has_truck: '없음', truck_type: '', stage: '서류접수', status: '', note: '',
  })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const [customPos, setCustomPos] = useState(false)

  const phoneDigits = f.phone.replace(/[^0-9]/g, '')
  const dup = existing.find(a => (a.phone || '').replace(/[^0-9]/g, '') === phoneDigits && phoneDigits.length >= 10)

  function save() {
    if (!f.name.trim() || !f.phone.trim()) { alert('이름과 연락처는 필수입니다'); return }
    const payload = {
      ...f,
      age: f.age ? Number(f.age) : null,
      career_years: f.career_years ? Number(f.career_years) : 0,
    }
    onSave(payload)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>지원자 등록</h3>
        <div className="modal-row"><label>이름 *</label>
          <input value={f.name} onChange={e => set('name', e.target.value)} placeholder="홍길동" /></div>
        <div className="modal-row"><label>연락처 *</label>
          <input type="tel" value={f.phone} onChange={e => set('phone', formatPhone(e.target.value))} placeholder="010-0000-0000" />
          {dup && <div style={{ color: '#A32D2D', fontSize: 12, marginTop: 4 }}>⚠️ 이미 등록된 연락처입니다 ({dup.name})</div>}
        </div>
        <div className="modal-row"><label>나이</label>
          <input type="number" value={f.age} onChange={e => set('age', e.target.value)} placeholder="예: 45" /></div>
        <div className="modal-row"><label>주거지</label>
          <input value={f.region} onChange={e => set('region', e.target.value)} placeholder="예: 서울 강서구" /></div>
        <div className="modal-row"><label>지원 직종</label>
          {!customPos ? (
            <select value={f.position} onChange={e => {
              if (e.target.value === '__direct__') { setCustomPos(true); set('position', '') }
              else set('position', e.target.value)
            }}>
              {POSITIONS.map(p => <option key={p}>{p}</option>)}
              <option value="__direct__">+ 직접 입력</option>
            </select>
          ) : (
            <input value={f.position} autoFocus onChange={e => set('position', e.target.value)} placeholder="직접 입력" />
          )}
        </div>
        <div className="modal-row"><label>경력 구분</label>
          <select value={f.career_type} onChange={e => set('career_type', e.target.value)}>
            {CAREER_TYPES.map(c => <option key={c}>{c}</option>)}</select></div>
        <div className="modal-row"><label>경력 연수(년)</label>
          <input type="number" value={f.career_years} onChange={e => set('career_years', e.target.value)} placeholder="예: 3" /></div>
        <div className="modal-row"><label>트럭 소유</label>
          <select value={f.has_truck} onChange={e => set('has_truck', e.target.value)}>
            {TRUCK_OPTIONS.map(t => <option key={t}>{t}</option>)}</select></div>
        <div className="modal-row"><label>차종</label>
          <input value={f.truck_type} onChange={e => set('truck_type', e.target.value)} placeholder="예: 1톤 탑차" /></div>
        <div className="modal-row"><label>구직자 상태</label>
          <select value={f.status} onChange={e => set('status', e.target.value)}>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s === '' ? '상태 없음' : s}</option>)}</select></div>
        <div className="modal-row"><label>기타 주요 경력</label>
          <input value={f.career_note} onChange={e => set('career_note', e.target.value)} placeholder="이전 직장, 자격증 등" /></div>
        <div className="modal-btns">
          <button className="cancel-btn" onClick={onClose}>취소</button>
          <button className="save-btn" onClick={save}>등록</button>
        </div>
      </div>
    </div>
  )
}
