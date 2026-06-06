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
const CALL_RESULTS = ['연결됨', '부재중', '콜백 예정', '거절', '기타']
const CALL_COLORS = {
  '연결됨': ['#E1F5EE', '#0F6E56'],
  '부재중': ['#FAEEDA', '#BA7517'],
  '콜백 예정': ['#EEEDFE', '#534AB7'],
  '거절': ['#FCEBEB', '#A32D2D'],
  '기타': ['#F1EFE8', '#5F5E5A'],
}

export default function App() {
  const [applicants, setApplicants] = useState([])
  const [calls, setCalls] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [filterStage, setFilterStage] = useState('전체')
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

  const filtered = applicants.filter(a => {
    const mq = !search || a.name.includes(search) || a.phone.includes(search)
    const ms = filterStage === '전체' || a.stage === filterStage
    return mq && ms
  })

  async function addApplicant(form) {
    const { data, error } = await supabase.from('applicants').insert([form]).select()
    if (error) { alert('등록 실패: ' + error.message); return }
    await loadData()
    if (data && data[0]) { setSelectedId(data[0].id); setActiveTab('info') }
    setShowModal(false)
  }

  async function updateField(id, field, value) {
    setApplicants(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a))
    await supabase.from('applicants').update({ [field]: value }).eq('id', id)
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

  return (
    <div className="app">
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>👥 구직자 관리</h2>
          <div className="search-box">
            <input placeholder="이름, 연락처 검색…" value={search}
              onChange={e => setSearch(e.target.value)} />
          </div>
          <button className="add-btn" onClick={() => setShowModal(true)}>+ 지원자 등록</button>
        </div>

        <div className="stage-filter">
          <p>채용 단계</p>
          {['전체', ...STAGES].map(s => {
            const count = s === '전체' ? applicants.length : applicants.filter(a => a.stage === s).length
            const [bg, fg] = s === '전체' ? ['#fff', '#555'] : STAGE_COLORS[s]
            return (
              <span key={s} className={'stage-pill' + (filterStage === s ? ' active' : '')}
                style={{ background: bg, color: fg }} onClick={() => setFilterStage(s)}>
                {s} {count}
              </span>
            )
          })}
        </div>

        <div className="applicant-list">
          {loading && <div className="hint">불러오는 중…</div>}
          {error && <div className="hint err">연결 오류: {error}</div>}
          {!loading && !filtered.length && <div className="hint">해당 지원자 없음</div>}
          {filtered.map(a => {
            const [bg, fg] = STAGE_COLORS[a.stage] || ['#eee', '#333']
            return (
              <div key={a.id} className={'applicant-card' + (a.id === selectedId ? ' selected' : '')}
                onClick={() => { setSelectedId(a.id); setActiveTab('info') }}>
                <div className="name">{a.name}</div>
                <div className="meta">
                  <span className="dot" style={{ background: fg }}></span>
                  <span className="tag" style={{ background: bg, color: fg }}>{a.stage}</span>
                  <span>{a.region || '-'}</span>
                </div>
                <div className="meta sub">📞 {a.phone}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="main">
        {!selected ? (
          <div className="empty">지원자를 선택하세요</div>
        ) : (
          <>
            <div className="main-header">
              <div className="row-between">
                <div>
                  <div className="detail-name">{selected.name}</div>
                  <div className="detail-meta">
                    <span>📞 {selected.phone}</span>
                    <span>📍 {selected.region || '-'}</span>
                    <span>💼 {selected.position || '-'}</span>
                  </div>
                </div>
                <button className="del-btn" onClick={() => deleteApplicant(selected.id)}>🗑 삭제</button>
              </div>
              <div className="stage-bar">
                {STAGES.map((s, i) => {
                  const idx = STAGES.indexOf(selected.stage)
                  const cls = i < idx ? 'done' : i === idx ? 'current' : 'future'
                  return (
                    <div key={s} className={'stage-step ' + cls}
                      onClick={() => updateField(selected.id, 'stage', s)}>{s}</div>
                  )
                })}
              </div>
            </div>

            <div className="tabs">
              <div className={'tab' + (activeTab === 'info' ? ' active' : '')}
                onClick={() => setActiveTab('info')}>기본 정보</div>
              <div className={'tab' + (activeTab === 'calls' ? ' active' : '')}
                onClick={() => setActiveTab('calls')}>통화 이력 ({selectedCalls.length})</div>
            </div>

            <div className="tab-content">
              {activeTab === 'info' ? (
                <InfoTab a={selected} onChange={updateField} />
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

      {showModal && <AddModal onClose={() => setShowModal(false)} onSave={addApplicant} />}
    </div>
  )
}

function InfoTab({ a, onChange }) {
  return (
    <>
      <p className="section-title">기본 정보</p>
      <div className="info-grid">
        <Field label="이름" value={a.name} onSave={v => onChange(a.id, 'name', v)} />
        <Field label="연락처" value={a.phone} onSave={v => onChange(a.id, 'phone', v)} />
        <Field label="나이" value={a.age} type="number" placeholder="예: 45"
          onSave={v => onChange(a.id, 'age', v ? Number(v) : null)} />
        <Field label="주거지" value={a.region} placeholder="예: 서울 강서"
          onSave={v => onChange(a.id, 'region', v)} />
        <SelectField label="지원 직종" value={a.position} options={POSITIONS}
          onSave={v => onChange(a.id, 'position', v)} />
        <SelectField label="채용 단계" value={a.stage} options={STAGES}
          onSave={v => onChange(a.id, 'stage', v)} />
        <SelectField label="경력 구분" value={a.career_type || '신입'} options={CAREER_TYPES}
          onSave={v => onChange(a.id, 'career_type', v)} />
        <Field label="경력 연수(년)" value={a.career_years} type="number" placeholder="예: 3"
          onSave={v => onChange(a.id, 'career_years', v ? Number(v) : 0)} />
        <SelectField label="트럭 소유" value={a.has_truck || '없음'} options={TRUCK_OPTIONS}
          onSave={v => onChange(a.id, 'has_truck', v)} />
        <Field label="차종" value={a.truck_type} placeholder="예: 1톤 탑차"
          onSave={v => onChange(a.id, 'truck_type', v)} />
      </div>
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

function AddModal({ onClose, onSave }) {
  const [f, setF] = useState({
    name: '', phone: '', age: '', region: '', position: '새벽수거',
    career_type: '신입', career_years: '', career_note: '',
    has_truck: '없음', truck_type: '', stage: '서류접수', note: '',
  })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

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
          <input value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="010-0000-0000" /></div>
        <div className="modal-row"><label>나이</label>
          <input type="number" value={f.age} onChange={e => set('age', e.target.value)} placeholder="예: 45" /></div>
        <div className="modal-row"><label>주거지</label>
          <input value={f.region} onChange={e => set('region', e.target.value)} placeholder="예: 서울 강서구" /></div>
        <div className="modal-row"><label>지원 직종</label>
          <select value={f.position} onChange={e => set('position', e.target.value)}>
            {POSITIONS.map(p => <option key={p}>{p}</option>)}</select></div>
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
