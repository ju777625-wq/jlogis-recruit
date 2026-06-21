import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

const STAGES = ['서류접수', '전화상담', '면접', '동승심사', '채용완료']
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
const STATUS_OPTIONS = ['', '재통화', '지원취소', '면접연기']
const STATUS_COLORS = {
  '재통화': ['#FAEEDA', '#BA7517'],
  '지원취소': ['#FCEBEB', '#A32D2D'],
  '면접연기': ['#F1EFE8', '#5F5E5A'],
}
const DEFAULT_STATUS_COLOR = ['#E6F1FB', '#185FA5'] // 직접입력한 상태 색
const statusColor = (s) => STATUS_COLORS[s] || DEFAULT_STATUS_COLOR
// 프리셋(빠른 칩)에선 빼고, '직접 입력'할 때 추천으로만 뜨는 상태
const STATUS_SUGGESTIONS = ['재면접의사', '결정통보다시']
const COMPANIES = ['오늘의집', '한샘', '주원', 'TK']
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
  const [myEvents, setMyEvents] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [view, setView] = useState('전체')
  const [screen, setScreen] = useState('today') // 'today' | 'list' | 'calendar'
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('info')
  const [showModal, setShowModal] = useState(false)
  const [showCallForm, setShowCallForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sidebarW, setSidebarW] = useState(() => {
    const saved = Number(localStorage.getItem('jlogis_sidebar_w'))
    return saved >= 320 && saved <= 900 ? saved : 480
  })

  // 좌우 폭 끌어서 조절 (PC 전용)
  function startResize(e) {
    e.preventDefault()
    let latest = sidebarW
    const onMove = (ev) => {
      const maxW = Math.min(760, window.innerWidth - 360)
      const w = Math.min(Math.max(ev.clientX, 320), maxW)
      latest = w
      setSidebarW(w)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
      try { localStorage.setItem('jlogis_sidebar_w', String(latest)) } catch (err) { /* 무시 */ }
    }
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

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
    // 내 일정: 테이블이 아직 없으면 조용히 건너뜀
    const { data: me, error: e3 } = await supabase
      .from('my_events').select('*').order('event_date', { ascending: true })
    if (!e3) setMyEvents(me || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    const ch = supabase
      .channel('realtime-recruit')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applicants' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'my_events' }, loadData)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [loadData])

  const selected = applicants.find(a => a.id === selectedId)
  const selectedCalls = calls.filter(c => c.applicant_id === selectedId)

  function matchView(a) {
    if (view === '전체') return true
    if (view.startsWith('s:')) return a.status === view.slice(2)
    if (view.startsWith('stage:')) return a.stage === view.slice(6)
    return true
  }

  const filtered = applicants.filter(a => {
    const mq = !search || a.name.includes(search) || (a.phone || '').includes(search)
    return mq && matchView(a)
  })

  // 상태 필터칩: 기본 상태 + 데이터에 실제로 쓰인 직접입력 상태까지 (추천 전용 상태는 제외)
  const statusChips = (() => {
    const base = STATUS_OPTIONS.filter(s => s)
    const used = [...new Set(applicants.map(a => a.status).filter(Boolean))]
    const extra = used.filter(s => !base.includes(s) && !STATUS_SUGGESTIONS.includes(s))
    return [...base, ...extra]
  })()

  function viewCount(key) {
    return applicants.filter(a => {
      if (key === '전체') return true
      if (key.startsWith('s:')) return a.status === key.slice(2)
      if (key.startsWith('stage:')) return a.stage === key.slice(6)
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

  async function addMyEvent(form) {
    const { error } = await supabase.from('my_events').insert([form])
    if (error) { alert('일정 저장 실패: ' + error.message + '\n(Supabase에 my_events 표를 먼저 만들었는지 확인하세요)'); return }
    await loadData()
  }

  async function deleteMyEvent(id) {
    if (!confirm('이 일정을 삭제할까요?')) return
    await supabase.from('my_events').delete().eq('id', id)
    await loadData()
  }

  function goScreen(s) { setScreen(s); if (s !== 'list') setSelectedId(null) }
  function pickApplicant(id) { setScreen('list'); setSelectedId(id); setActiveTab('info') }

  async function updateMyEvent(id, patch) {
    setMyEvents(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
    await supabase.from('my_events').update(patch).eq('id', id)
  }
  function toggleDone(item) {
    if (item.kind === 'mine') updateMyEvent(item.id, { done: !item.done })
    else updateField(item.id, item.type === '면접' ? 'interview_done' : 'consult_done', !item.done)
  }

  const detailOpen = !!selected

  return (
    <div className={'app' + ((detailOpen || screen === 'calendar' || screen === 'today') ? ' detail-open' : '')}
      style={{ '--sidebar-w': sidebarW + 'px' }}>
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="topbar">
            <h2>👥 구직자 관리</h2>
            <div className="topbar-btns">
              <button className={'mini-btn' + (searchOpen ? ' on' : '')} title="검색"
                onClick={() => setSearchOpen(o => !o)}>🔍</button>
              <button className="mini-btn" title="지원자 등록" onClick={() => setShowModal(true)}>＋</button>
            </div>
          </div>
          <ScreenNav current={screen} onNav={goScreen} />
          {searchOpen && (
            <div className="search-box">
              <input autoFocus placeholder="이름, 연락처 검색…" value={search}
                onChange={e => setSearch(e.target.value)} />
            </div>
          )}
        </div>

        <div className="stage-filter">
          <div className="filter-row">
            <span className={'stage-pill all' + (view === '전체' ? ' active' : '')}
              onClick={() => setView('전체')}>전체 {viewCount('전체')}</span>
            {STAGES.map(s => {
              const [bg, fg] = STAGE_COLORS[s]
              const on = view === 'stage:' + s
              return (
                <span key={s} className={'stage-pill' + (on ? ' active' : '')}
                  style={{ background: bg, color: fg, borderColor: on ? fg : bg }}
                  onClick={() => setView('stage:' + s)}>
                  {s} {viewCount('stage:' + s)}
                </span>
              )
            })}
          </div>
          <div className="filter-row wrap" style={{ marginTop: 6 }}>
            {statusChips.map(s => {
              const [bg, fg] = statusColor(s)
              const on = view === 's:' + s
              const cnt = viewCount('s:' + s)
              return (
                <span key={s} className={'stage-pill' + (on ? ' active' : '')}
                  style={{ background: bg, color: fg, borderColor: on ? fg : bg }}
                  onClick={() => setView('s:' + s)}>
                  {s} {cnt}
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
            const meta = [a.age ? a.age + '세' : '', a.region, a.position, a.target_company]
              .filter(Boolean).join(' · ')
            return (
              <div key={a.id} className={'ap-card' + (a.id === selectedId ? ' selected' : '')}
                onClick={() => { setSelectedId(a.id); setActiveTab('info') }}>
                <div className="ap-top">
                  <span className="ap-name">{a.name}</span>
                  {a.has_truck === '있음' && <span className="ap-truck">🚚</span>}
                  {a.status ? (
                    <span className="ap-badge" style={{ background: statusColor(a.status)[0], color: statusColor(a.status)[1] }}>{a.status}</span>
                  ) : (
                    <span className="ap-badge" style={{ background: bg, color: fg }}>{a.stage}</span>
                  )}
                </div>
                <div className="ap-meta">{meta || '정보 없음'}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="resizer" onMouseDown={startResize} title="끌어서 좌우 폭 조절" />

      <div className="main">
        {screen === 'today' ? (
          <TodayView applicants={applicants} myEvents={myEvents}
            onAddMyEvent={addMyEvent} onDeleteMyEvent={deleteMyEvent} onToggleDone={toggleDone}
            onPick={pickApplicant} onNav={goScreen} />
        ) : screen === 'calendar' ? (
          <CalendarView applicants={applicants} myEvents={myEvents}
            onAddMyEvent={addMyEvent} onDeleteMyEvent={deleteMyEvent}
            onPick={pickApplicant} onBack={() => goScreen('today')} onNav={goScreen} />
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
                    {selected.target_company && <span>🏢 {selected.target_company}</span>}
                  </div>
                  {selected.status && (
                    <div style={{ marginTop: 6 }}>
                      <span className="tag" style={{ background: statusColor(selected.status)[0], color: statusColor(selected.status)[1], fontWeight: 600, fontSize: 13, padding: '3px 10px' }}>{selected.status}</span>
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
        <StatusField value={a.status} onSave={v => onChange(a.id, 'status', v)} />
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
        <ComboField label="구직회사" value={a.target_company} options={COMPANIES}
          onSave={v => onChange(a.id, 'target_company', v)} />
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

// 구직자 상태: 기본 선택 + 직접입력
function StatusField({ value, onSave }) {
  const known = STATUS_OPTIONS.includes(value || '')
  const [custom, setCustom] = useState(!known && !!value)
  if (custom) {
    return (
      <>
        <input defaultValue={value || ''} placeholder="상태 직접 입력 (예: 결정통보 대기)" autoFocus
          list="status-suggest-info"
          onBlur={e => { onSave(e.target.value); if (!e.target.value) setCustom(false) }} />
        <datalist id="status-suggest-info">
          {STATUS_SUGGESTIONS.map(s => <option key={s} value={s} />)}
        </datalist>
      </>
    )
  }
  return (
    <select value={known ? (value || '') : ''} onChange={e => {
      if (e.target.value === '__direct__') { setCustom(true) }
      else onSave(e.target.value)
    }}>
      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s === '' ? '상태 없음' : s}</option>)}
      <option value="__direct__">+ 직접 입력</option>
    </select>
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

// 화면 전환 네비 (오늘 / 명단 / 달력)
function ScreenNav({ current, onNav, className = '' }) {
  const items = [['today', '🏠 오늘'], ['list', '📋 명단'], ['calendar', '📅 달력']]
  return (
    <div className={'screen-nav ' + className}>
      {items.map(([k, l]) => (
        <button key={k} className={current === k ? 'on' : ''} onClick={() => onNav(k)}>{l}</button>
      ))}
    </div>
  )
}

// "오늘" 브리핑 화면 — 비서처럼 오늘 일정 + 통화할 사람 + 놓친 일정
function TodayView({ applicants, myEvents = [], onAddMyEvent, onDeleteMyEvent, onToggleDone, onPick, onNav }) {
  const [addOpen, setAddOpen] = useState(false)
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const dow = ['일', '월', '화', '수', '목', '금', '토']
  const isSameDay = (dt) => {
    const d = new Date(dt)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  }

  // 오늘 일정 모으기 (면접 / 전화상담 / 내 일정)
  const todays = []
  applicants.forEach(a => {
    if (a.interview_at && isSameDay(a.interview_at))
      todays.push({ kind: 'cand', id: a.id, sortAt: new Date(a.interview_at), time: hm(new Date(a.interview_at)), type: '면접', name: a.name, phone: a.phone, company: a.target_company, place: a.interview_place, done: !!a.interview_done })
    if (a.consult_at && isSameDay(a.consult_at))
      todays.push({ kind: 'cand', id: a.id, sortAt: new Date(a.consult_at), time: hm(new Date(a.consult_at)), type: '전화상담', name: a.name, phone: a.phone, company: a.target_company, place: a.consult_place, done: !!a.consult_done })
  })
  myEvents.forEach(ev => {
    if (ev.event_date === todayStr)
      todays.push({ kind: 'mine', id: ev.id, sortAt: new Date(`${ev.event_date}T${ev.event_time || '00:00'}`), time: ev.event_time || '', allday: !ev.event_time, type: '내일정', name: ev.title, place: ev.place, memo: ev.memo, done: !!ev.done })
  })
  // 완료한 항목은 아래로, 그 안에서 시간순
  todays.sort((x, y) => (x.done ? 1 : 0) - (y.done ? 1 : 0) || x.sortAt - y.sortAt)
  const todayDoneCnt = todays.filter(t => t.done).length

  // 오늘 챙길 사람: 상태가 있는 사람(지원취소·추천전용 상태 제외)을 상태별로 묶기
  const followups = applicants.filter(a => a.status && a.status !== '지원취소' && !STATUS_SUGGESTIONS.includes(a.status))
  const groups = {}
  followups.forEach(a => { (groups[a.status] = groups[a.status] || []).push(a) })
  const groupOrder = ['재통화', '면접연기', ...Object.keys(groups).filter(s => !['재통화', '면접연기'].includes(s))]
    .filter(s => groups[s])

  // 놓친 일정: 오늘 이전(지난 7일) 면접/전화
  const overdue = []
  applicants.forEach(a => {
    if (a.interview_at) { const df = dayDiff(a.interview_at); if (df < 0 && df >= -7) overdue.push({ id: a.id, name: a.name, type: '면접', at: a.interview_at }) }
    if (a.consult_at) { const df = dayDiff(a.consult_at); if (df < 0 && df >= -7) overdue.push({ id: a.id, name: a.name, type: '전화상담', at: a.consult_at }) }
  })
  overdue.sort((x, y) => new Date(y.at) - new Date(x.at))

  const TYPE = { '면접': ['#EEEDFE', '#534AB7'], '전화상담': ['#FAEEDA', '#BA7517'], '내일정': ['#E1F5EE', '#0F6E56'] }
  const cnt = {
    iv: todays.filter(t => t.type === '면접').length,
    cs: todays.filter(t => t.type === '전화상담').length,
    me: todays.filter(t => t.type === '내일정').length,
  }
  const evLabel = (at) => { const d = new Date(at); return `${d.getMonth() + 1}/${d.getDate()}(${dow[d.getDay()]}) ${hm(d)}` }

  return (
    <div className="today-wrap">
      <ScreenNav current="today" onNav={onNav} className="main-nav" />
      <div className="today-head">
        <div className="today-date">오늘 · {now.getMonth() + 1}월 {now.getDate()}일 ({dow[now.getDay()]})</div>
        <div className="today-summary">
          <span>면접 {cnt.iv}</span>
          <span>전화상담 {cnt.cs}</span>
          <span>내 일정 {cnt.me}</span>
          <span className="cb">챙길 사람 {followups.length}</span>
        </div>
      </div>

      <div className="tv-section">
        <div className="tv-section-title">오늘 일정 {todays.length > 0 && <span className="tv-done-count">{todayDoneCnt}/{todays.length} 완료</span>}</div>
        {todays.length ? todays.map((it, i) => {
          const [bg, fg] = TYPE[it.type] || ['#eee', '#555']
          return (
            <div key={i} className={'tv-card' + (it.done ? ' done' : '')} onClick={() => it.kind === 'cand' && onPick(it.id)}
              style={{ cursor: it.kind === 'cand' ? 'pointer' : 'default' }}>
              <button className={'tv-check' + (it.done ? ' on' : '')} title="완료 표시"
                onClick={(e) => { e.stopPropagation(); onToggleDone(it) }}>{it.done ? '✓' : ''}</button>
              <div className="tv-time">{it.allday ? '종일' : it.time}</div>
              <div className="tv-body">
                <div className="tv-row1">
                  <span className="tv-type" style={{ background: bg, color: fg }}>{it.type}</span>
                  <span className="tv-name">{it.name}</span>
                  {it.kind === 'mine' && <button className="tv-del" onClick={(e) => { e.stopPropagation(); onDeleteMyEvent(it.id) }}>✕</button>}
                </div>
                <div className="tv-meta">
                  {[it.company, it.place ? '📍' + it.place : '', it.memo].filter(Boolean).join(' · ')}
                </div>
                {it.kind === 'cand' && it.phone && (
                  <a className="tv-call" href={'tel:' + it.phone} onClick={e => e.stopPropagation()}>📞 {it.phone}</a>
                )}
              </div>
            </div>
          )
        }) : <div className="tv-empty">오늘 예정된 일정이 없습니다.</div>}
        <button className="tv-add" onClick={() => setAddOpen(true)}>＋ 오늘 일정 추가</button>
      </div>

      <div className="tv-section">
        <div className="tv-section-title">오늘 챙길 사람 <span className="tv-count">{followups.length}</span></div>
        {groupOrder.length ? groupOrder.map(st => {
          const [bg, fg] = statusColor(st)
          return (
            <div key={st} className="tv-group">
              <div className="tv-group-head"><span className="tv-type" style={{ background: bg, color: fg }}>{st}</span> {groups[st].length}명</div>
              {groups[st].map(a => (
                <div key={a.id} className="tv-card cb" style={{ borderLeftColor: fg }} onClick={() => onPick(a.id)}>
                  <div className="tv-body">
                    <div className="tv-row1"><span className="tv-name">{a.name}</span></div>
                    <div className="tv-meta">{[a.target_company, a.position, a.region].filter(Boolean).join(' · ')}</div>
                    {a.phone && <a className="tv-call" href={'tel:' + a.phone} onClick={e => e.stopPropagation()}>📞 {a.phone}</a>}
                  </div>
                </div>
              ))}
            </div>
          )
        }) : <div className="tv-empty">상태로 표시한 사람이 없습니다. (재통화·면접연기 등)</div>}
      </div>

      {!!overdue.length && (
        <details className="tv-section tv-overdue">
          <summary>놓친 일정 {overdue.length}건 보기</summary>
          {overdue.map((it, i) => (
            <div key={i} className="tv-card mini" onClick={() => onPick(it.id)} style={{ cursor: 'pointer' }}>
              <div className="tv-body">
                <div className="tv-row1"><span className="tv-name">{it.name}</span><span className="tv-mini-type">{it.type}</span></div>
                <div className="tv-meta">{evLabel(it.at)}</div>
              </div>
            </div>
          ))}
        </details>
      )}

      {addOpen && <MyEventModal date={todayStr} onClose={() => setAddOpen(false)}
        onSave={(form) => { onAddMyEvent(form); setAddOpen(false) }} />}
    </div>
  )
}

function CalendarView({ applicants, myEvents = [], onAddMyEvent, onDeleteMyEvent, onPick, onBack, onNav }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const [addDate, setAddDate] = useState(null) // 내 일정 추가용 날짜(YYYY-MM-DD)

  // 날짜별 일정 모으기
  const events = {}
  function add(dateKey, ev) { (events[dateKey] = events[dateKey] || []).push(ev) }
  applicants.forEach(a => {
    if (a.interview_at) {
      const d = new Date(a.interview_at)
      add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`, { kind: 'cand', id: a.id, name: a.name, type: '면접', time: hm(d) })
    }
    if (a.consult_at) {
      const d = new Date(a.consult_at)
      add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`, { kind: 'cand', id: a.id, name: a.name, type: '전화상담', time: hm(d) })
    }
  })
  myEvents.forEach(ev => {
    if (!ev.event_date) return
    const [y, mo, da] = ev.event_date.split('-').map(Number)
    add(`${y}-${mo - 1}-${da}`, { kind: 'mine', id: ev.id, name: ev.title, type: '내일정', time: ev.event_time || '' })
  })

  // 각 날짜 칸의 일정을 시간 오름차순으로 정렬 (시간 없는 일정은 맨 위)
  Object.values(events).forEach(list =>
    list.sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  )

  const first = new Date(cursor.y, cursor.m, 1)
  const startDow = first.getDay()
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const today = new Date()
  const isToday = d => d === today.getDate() && cursor.m === today.getMonth() && cursor.y === today.getFullYear()
  const pad = n => String(n).padStart(2, '0')

  function move(diff) {
    let m = cursor.m + diff, y = cursor.y
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setCursor({ y, m })
  }

  const DOW = ['일', '월', '화', '수', '목', '금', '토']

  return (
    <div className="cal-layout">
      <AgendaPanel applicants={applicants} myEvents={myEvents}
        onPick={onPick} onBack={onBack} onNav={onNav} onDeleteMyEvent={onDeleteMyEvent} />
      <div className="cal-wrap">
        <div className="cal-head">
          <button onClick={() => move(-1)}>‹</button>
          <span className="cal-title">{cursor.y}년 {cursor.m + 1}월</span>
          <button onClick={() => move(1)}>›</button>
          <button className="cal-today" onClick={() => { const d = new Date(); setCursor({ y: d.getFullYear(), m: d.getMonth() }) }}>오늘</button>
        </div>
        <div className="cal-legend">
          <span><i className="lg lg-iv" /> 면접</span>
          <span><i className="lg lg-cs" /> 전화상담</span>
          <span><i className="lg lg-me" /> 내 일정</span>
          <span className="cal-hint-inline">날짜 칸을 누르면 내 일정 추가</span>
        </div>
        <div className="cal-grid cal-dow">
          {DOW.map((d, i) => <div key={d} className={'cal-dowcell' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '')}>{d}</div>)}
        </div>
        <div className="cal-grid cal-body">
          {cells.map((d, i) => {
            const key = d ? `${cursor.y}-${cursor.m}-${d}` : 'e' + i
            const evs = d ? (events[key] || []) : []
            const dateStr = d ? `${cursor.y}-${pad(cursor.m + 1)}-${pad(d)}` : ''
            return (
              <div key={key} className={'cal-cell' + (d && isToday(d) ? ' today' : '') + (!d ? ' empty' : '')}
                onClick={() => { if (d) setAddDate(dateStr) }}>
                {d && <div className={'cal-daynum' + (i % 7 === 0 ? ' sun' : i % 7 === 6 ? ' sat' : '')}>{d}</div>}
                {evs.map((ev, j) => (
                  <div key={j}
                    className={'cal-ev ' + (ev.type === '면접' ? 'iv' : ev.type === '전화상담' ? 'cs' : 'me')}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (ev.kind === 'mine') onDeleteMyEvent(ev.id)
                      else onPick(ev.id)
                    }}
                    title={ev.kind === 'mine' ? '내 일정 (눌러서 삭제)' : ev.type + ' ' + ev.name}>
                    {ev.time && <b>{ev.time}</b>} {ev.name}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
      {addDate && (
        <MyEventModal date={addDate} onClose={() => setAddDate(null)}
          onSave={(form) => { onAddMyEvent(form); setAddDate(null) }} />
      )}
    </div>
  )
}

// 날짜 차이(일): 오늘=0, 내일=1, 어제=-1
function dayDiff(dateStr) {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0)
  return Math.round((d - now) / 86400000)
}

// 임박도에 따른 색 (오늘=빨강, 1~2일=주황, 3~7일=파랑, 지남=회색)
function urgencyColor(diff) {
  if (diff < 0) return ['#F1EFE8', '#8a8a85', '지남']
  if (diff === 0) return ['#FCEBEB', '#C0392B', '오늘']
  if (diff <= 2) return ['#FAEEDA', '#BA7517', 'D-' + diff]
  return ['#E6F1FB', '#185FA5', 'D-' + diff]
}

// 달력 옆 "비서" 패널 — 오늘 / 이번 주 면접·전화예약·내 일정을 한눈에
function AgendaPanel({ applicants, myEvents = [], onPick, onBack, onNav, onDeleteMyEvent }) {
  const items = []
  applicants.forEach(a => {
    if (a.interview_at) items.push({ kind: 'cand', id: a.id, name: a.name, company: a.target_company, place: a.interview_place, type: '면접', at: a.interview_at })
    if (a.consult_at) items.push({ kind: 'cand', id: a.id, name: a.name, company: a.target_company, place: a.consult_place, type: '전화상담', at: a.consult_at })
  })
  myEvents.forEach(ev => {
    if (!ev.event_date) return
    const at = new Date(`${ev.event_date}T${ev.event_time || '00:00'}`)
    items.push({ kind: 'mine', id: ev.id, name: ev.title, place: ev.place, memo: ev.memo, type: '내일정', at: at.toISOString(), allday: !ev.event_time })
  })

  const enriched = items
    .map(it => ({ ...it, diff: dayDiff(it.at) }))
    .filter(it => it.diff >= -3 && it.diff <= 7)
    .sort((x, y) => new Date(x.at) - new Date(y.at))

  const todayList = enriched.filter(it => it.diff === 0)
  const weekList = enriched.filter(it => it.diff >= 1)
  const overdue = enriched.filter(it => it.diff < 0)

  const dow = ['일', '월', '화', '수', '목', '금', '토']
  function label(it) {
    const d = new Date(it.at)
    const date = `${d.getMonth() + 1}/${d.getDate()}(${dow[d.getDay()]})`
    const time = it.allday ? '종일' : hm(d)
    return `${date} ${time}`
  }

  function Row({ it }) {
    const [bg, fg, tag] = urgencyColor(it.diff)
    const typeCls = it.type === '면접' ? 'iv' : it.type === '전화상담' ? 'cs' : 'me'
    return (
      <div className="ag-item" style={{ borderLeftColor: fg }}
        onClick={() => { if (it.kind === 'cand') onPick(it.id) }}>
        <div className="ag-line1">
          <span className="ag-tag" style={{ background: bg, color: fg }}>{tag}</span>
          <span className="ag-name">{it.name}</span>
          <span className={'ag-type ' + typeCls}>{it.type}</span>
          {it.kind === 'mine' && (
            <button className="ag-del" onClick={(e) => { e.stopPropagation(); onDeleteMyEvent(it.id) }}>✕</button>
          )}
        </div>
        <div className="ag-line2">
          {label(it)}
          {it.company ? ' · ' + it.company : ''}
          {it.place ? ' · 📍' + it.place : ''}
        </div>
        {it.memo && <div className="ag-memo">{it.memo}</div>}
      </div>
    )
  }

  const empty = !todayList.length && !weekList.length && !overdue.length

  return (
    <div className="agenda">
      <ScreenNav current="calendar" onNav={onNav} className="main-nav" />
      <div className="ag-head">🗒️ 내 일정표</div>
      {empty && (
        <div className="hint" style={{ padding: '14px 4px', textAlign: 'left' }}>
          예정된 일정이 없습니다.<br />달력에서 날짜를 눌러 내 일정을 추가해 보세요.
        </div>
      )}
      <div className="ag-group">
        <div className="ag-grouptitle today">오늘 ({todayList.length})</div>
        {todayList.length ? todayList.map((it, i) => <Row key={'t' + i} it={it} />)
          : <div className="ag-none">오늘은 일정이 없습니다</div>}
      </div>
      {!!weekList.length && (
        <div className="ag-group">
          <div className="ag-grouptitle">이번 주 ({weekList.length})</div>
          {weekList.map((it, i) => <Row key={'w' + i} it={it} />)}
        </div>
      )}
      {!!overdue.length && (
        <div className="ag-group">
          <div className="ag-grouptitle">지난 일정 ({overdue.length})</div>
          {overdue.map((it, i) => <Row key={'o' + i} it={it} />)}
        </div>
      )}
    </div>
  )
}

// 내 일정 추가 모달
function MyEventModal({ date, onClose, onSave }) {
  const [f, setF] = useState({ event_date: date, event_time: '', title: '', place: '', memo: '' })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const pad = n => String(n).padStart(2, '0')
  const TIMES = []
  for (let h = 6; h <= 22; h++) { TIMES.push(`${pad(h)}:00`); TIMES.push(`${pad(h)}:30`) }

  function save() {
    if (!f.title.trim()) { alert('일정 제목을 입력하세요'); return }
    onSave({ ...f, event_time: f.event_time || null })
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>내 일정 추가</h3>
        <div className="modal-row"><label>날짜</label>
          <input type="date" value={f.event_date} onChange={e => set('event_date', e.target.value)} /></div>
        <div className="modal-row"><label>시간 (선택 안 하면 종일)</label>
          <select value={f.event_time} onChange={e => set('event_time', e.target.value)}>
            <option value="">종일</option>
            {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
          </select></div>
        <div className="modal-row"><label>제목 *</label>
          <input value={f.title} autoFocus onChange={e => set('title', e.target.value)} placeholder="예: 화물협회 미팅" /></div>
        <div className="modal-row"><label>장소</label>
          <input value={f.place} onChange={e => set('place', e.target.value)} placeholder="예: 판교 사무실" /></div>
        <div className="modal-row"><label>메모</label>
          <input value={f.memo} onChange={e => set('memo', e.target.value)} placeholder="간단 메모" /></div>
        <div className="modal-btns">
          <button className="cancel-btn" onClick={onClose}>취소</button>
          <button className="save-btn" onClick={save}>추가</button>
        </div>
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
    `지원자: ${a.name}\n연락처: ${a.phone || ''}\n지원직종: ${a.position || ''}\n구직회사: ${a.target_company || ''}\n나이: ${a.age || ''}\n트럭: ${a.has_truck || ''} ${a.truck_type || ''}`
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
    target_company: '오늘의집',
    career_type: '신입', career_years: '', career_note: '',
    has_truck: '없음', truck_type: '', stage: '서류접수', status: '', note: '',
  })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const [customPos, setCustomPos] = useState(false)
  const [customCo, setCustomCo] = useState(false)
  const [customStatus, setCustomStatus] = useState(false)

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
        <div className="modal-row"><label>구직회사</label>
          {!customCo ? (
            <select value={f.target_company} onChange={e => {
              if (e.target.value === '__direct__') { setCustomCo(true); set('target_company', '') }
              else set('target_company', e.target.value)
            }}>
              {COMPANIES.map(c => <option key={c}>{c}</option>)}
              <option value="__direct__">+ 직접 입력</option>
            </select>
          ) : (
            <input value={f.target_company} autoFocus onChange={e => set('target_company', e.target.value)} placeholder="회사명 직접 입력" />
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
          {!customStatus ? (
            <select value={f.status} onChange={e => {
              if (e.target.value === '__direct__') { setCustomStatus(true); set('status', '') }
              else set('status', e.target.value)
            }}>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s === '' ? '상태 없음' : s}</option>)}
              <option value="__direct__">+ 직접 입력</option>
            </select>
          ) : (
            <>
              <input value={f.status} autoFocus onChange={e => set('status', e.target.value)} placeholder="상태 직접 입력" list="status-suggest-add" />
              <datalist id="status-suggest-add">
                {STATUS_SUGGESTIONS.map(s => <option key={s} value={s} />)}
              </datalist>
            </>
          )}
        </div>
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
