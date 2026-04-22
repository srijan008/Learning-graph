import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { BookOpen, Zap, GraduationCap, Target, Clock, ChevronRight, List, BarChart2, Layers } from 'lucide-react';

const API = 'http://127.0.0.1:8002/api/v1';
const USER = 'user_123';

type TestType = 'topic_quiz' | 'chapter_mock' | 'full_mock' | 'practice_drill';
type Step = 'type' | 'config' | 'ready';

interface SubjectData { [subject: string]: Array<{ chapter: string; chapter_name: string }> }

const TEST_TYPES = [
  {
    id: 'topic_quiz' as TestType,
    label: 'Topic Quiz',
    desc: 'Quick 10-30 question test on a single chapter topic.',
    icon: Zap,
    color: '#6366f1',
    time: '30 mins',
    qRange: '10-30',
  },
  {
    id: 'chapter_mock' as TestType,
    label: 'Chapter Mock Test',
    desc: 'Full chapter coverage across all topics.',
    icon: BookOpen,
    color: '#10b981',
    time: '45-60 mins',
    qRange: '30-50',
  },
  {
    id: 'full_mock' as TestType,
    label: 'Full NEET Mock',
    desc: '180 questions across Physics, Chemistry, Botany, Zoology — NEET-style with AI strategy.',
    icon: GraduationCap,
    color: '#f59e0b',
    time: '3 hr 20 min',
    qRange: '180',
  },
  {
    id: 'practice_drill' as TestType,
    label: 'Targeted Practice',
    desc: 'AI generates questions targeting your weak topics.',
    icon: Target,
    color: '#ec4899',
    time: 'Flexible',
    qRange: '20',
  },
];

export default function TestLobbyPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('type');
  const [selectedType, setSelectedType] = useState<TestType | null>(null);
  const [subjects, setSubjects] = useState<SubjectData>({});
  
  const [selSubject, setSelSubject] = useState('');
  const [selChapter, setSelChapter] = useState('');
  
  // Topic selection specifically for topic_quiz
  const [topics, setTopics] = useState<Array<{id: string, name: string}>>([]);
  const [selTopic, setSelTopic] = useState('');

  const [qCount, setQCount] = useState(20);
  const [timeMins, setTimeMins] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get(`${API}/test/subjects`).then(r => setSubjects(r.data)).catch(() => {});
  }, []);

  // Fetch topics whenever a chapter is selected and type is topic_quiz
  useEffect(() => {
    if (selectedType === 'topic_quiz' && selChapter) {
      axios.get(`${API}/test/chapters/${selChapter}/topics`)
        .then(r => {
          setTopics(r.data.topics || []);
          setSelTopic('');
        })
        .catch(() => setTopics([]));
    } else {
      setTopics([]);
      setSelTopic('');
    }
  }, [selChapter, selectedType]);

  const handleSelectType = (type: TestType) => {
    setSelectedType(type);
    if (type === 'full_mock') {
      setQCount(180);
      setTimeMins(200);
      setStep('ready');
    } else if (type === 'practice_drill') {
      setQCount(20);
      setTimeMins(40);
      setStep('ready');
    } else {
      setStep('config');
    }
  };

  const startTest = async () => {
    setLoading(true);
    setError('');
    try {
      const payload: any = {
        user_id: USER,
        test_type: selectedType,
        subject: selSubject || null,
        chapter: selChapter || null,
        topic_id: selTopic || null,
        question_count: qCount,
        time_limit_mins: timeMins,
      };
      const res = await axios.post(`${API}/test/session/create`, payload);
      const { session_id } = res.data;
      navigate(`/test/${session_id}`, { state: res.data });
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  };

  const typeInfo = TEST_TYPES.find(t => t.id === selectedType);

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 16px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '36px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <BarChart2 size={32} color="var(--accent-primary)" />
          <h1 className="page-title" style={{ margin: 0 }}>Test Center</h1>
        </div>
        <p style={{ color: 'var(--text-secondary)' }}>Choose your test type and prepare for NEET with precision</p>
      </div>

      {/* Step: Type Selection */}
      {step === 'type' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {TEST_TYPES.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => handleSelectType(t.id)}
                className="glass-panel"
                style={{
                  textAlign: 'left', padding: '24px', cursor: 'pointer', border: `1px solid rgba(255,255,255,0.08)`,
                  background: 'rgba(255,255,255,0.03)', transition: 'all 0.2s', position: 'relative', overflow: 'hidden',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = t.color; e.currentTarget.style.background = `${t.color}15`; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: `${t.color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={24} color={t.color} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: '0 0 6px', color: 'white', fontSize: '1rem', fontWeight: 700 }}>{t.label}</h3>
                    <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.5 }}>{t.desc}</p>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: '20px', background: `${t.color}20`, color: t.color }}>
                        <Clock size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />{t.time}
                      </span>
                      <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: '20px', background: `${t.color}20`, color: t.color }}>
                        <List size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />{t.qRange} Qs
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={16} style={{ color: 'var(--text-secondary)', marginTop: 4 }} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Step: Config */}
      {step === 'config' && typeInfo && (
        <div className="glass-panel" style={{ padding: '32px' }}>
          <button onClick={() => setStep('type')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
            ← Back
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: `${typeInfo.color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <typeInfo.icon size={20} color={typeInfo.color} />
            </div>
            <div>
              <h2 style={{ margin: 0, color: 'white', fontSize: '1.1rem' }}>{typeInfo.label}</h2>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{typeInfo.desc}</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
            {/* Subject */}
            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.78rem', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subject</label>
              <select
                value={selSubject}
                onChange={e => { setSelSubject(e.target.value); setSelChapter(''); setSelTopic(''); }}
                style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: 'white', fontSize: '0.9rem', outline: 'none', cursor: 'pointer' }}
              >
                <option value="">All Subjects</option>
                {Object.keys(subjects).map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>

            {/* Chapter */}
            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.78rem', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Chapter</label>
              <select
                value={selChapter}
                onChange={e => setSelChapter(e.target.value)}
                disabled={!selSubject}
                style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: selSubject ? 'white' : 'var(--text-secondary)', fontSize: '0.9rem', outline: 'none', cursor: selSubject ? 'pointer' : 'not-allowed', opacity: selSubject ? 1 : 0.5 }}
              >
                <option value="">All Chapters</option>
                {(subjects[selSubject] || []).map(c => (
                  <option key={c.chapter} value={c.chapter}>{c.chapter_name}</option>
                ))}
              </select>
            </div>

            {/* Topic (Conditional) */}
            {selectedType === 'topic_quiz' && (
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.78rem', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Topic</label>
                <select
                  value={selTopic}
                  onChange={e => setSelTopic(e.target.value)}
                  disabled={!selChapter}
                  style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: selChapter ? 'white' : 'var(--text-secondary)', fontSize: '0.9rem', outline: 'none', cursor: selChapter ? 'pointer' : 'not-allowed', opacity: selChapter ? 1 : 0.5 }}
                >
                  <option value="">{topics.length > 0 ? "Select Topic" : "All Chapter Topics"}</option>
                  {topics.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Q Count */}
            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.78rem', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Questions: {qCount}</label>
              <input
                type="range" min={10} max={50} step={5} value={qCount}
                onChange={e => { const v = Number(e.target.value); setQCount(v); setTimeMins(Math.round(v * 1.5)); }}
                style={{ width: '100%', accentColor: typeInfo.color }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                <span>10</span><span>50</span>
              </div>
            </div>

            {/* Timer */}
            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.78rem', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time Limit: {timeMins} min</label>
              <input
                type="range" min={10} max={90} step={5} value={timeMins}
                onChange={e => setTimeMins(Number(e.target.value))}
                style={{ width: '100%', accentColor: typeInfo.color }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                <span>10 min</span><span>90 min</span>
              </div>
            </div>
          </div>

          <button onClick={() => setStep('ready')} className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: '1rem', background: `linear-gradient(135deg, ${typeInfo.color}, ${typeInfo.color}cc)` }}>
            Continue →
          </button>
        </div>
      )}

      {/* Step: Ready */}
      {step === 'ready' && typeInfo && (
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center' }}>
          <button onClick={() => setStep(selectedType === 'full_mock' || selectedType === 'practice_drill' ? 'type' : 'config')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
            ← Back
          </button>
          <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: `linear-gradient(135deg, ${typeInfo.color}40, ${typeInfo.color}20)`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', border: `2px solid ${typeInfo.color}60` }}>
            <typeInfo.icon size={32} color={typeInfo.color} />
          </div>
          <h2 style={{ color: 'white', marginBottom: '8px' }}>{typeInfo.label}</h2>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', margin: '20px 0 32px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: typeInfo.color }}>{qCount}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Questions</div>
            </div>
            <div style={{ width: '1px', background: 'var(--border-color)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: typeInfo.color }}>{timeMins}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Minutes</div>
            </div>
            <div style={{ width: '1px', background: 'var(--border-color)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: typeInfo.color }}>+4/-1</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Marking</div>
            </div>
          </div>

          {selectedType === 'full_mock' && (
            <div style={{ marginBottom: '24px', padding: '16px', borderRadius: '10px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', textAlign: 'left' }}>
              <div style={{ fontWeight: 600, color: '#f59e0b', marginBottom: '8px', fontSize: '0.85rem' }}>📋 NEET Full Mock — 180 Questions</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {['Physics 45Q', 'Chemistry 45Q', 'Botany 45Q', 'Zoology 45Q'].map(s => (
                  <div key={s} style={{ padding: '6px 8px', borderRadius: '6px', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', textAlign: 'center' }}>{s}</div>
                ))}
              </div>
            </div>
          )}

          {error && <div style={{ marginBottom: '16px', padding: '10px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', color: '#fca5a5', fontSize: '0.85rem' }}>⚠️ {error}</div>}

          <button
            onClick={startTest}
            disabled={loading}
            style={{
              width: '100%', padding: '16px', borderRadius: '12px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              background: loading ? 'rgba(255,255,255,0.1)' : `linear-gradient(135deg, ${typeInfo.color}, ${typeInfo.color}cc)`,
              color: 'white', fontSize: '1.1rem', fontWeight: 700, transition: 'all 0.2s',
            }}
          >
            {loading ? 'Preparing Test...' : '🚀 Start Test'}
          </button>
          <p style={{ marginTop: '12px', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
            Once started, your progress auto-saves. You can resume if the browser closes.
          </p>
        </div>
      )}

      <style>{`
        select option { background: #1e293b; color: white; }
      `}</style>
    </div>
  );
}
