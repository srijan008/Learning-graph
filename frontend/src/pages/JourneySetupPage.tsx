import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Target, BookOpen, Clock, Zap, Plus, X,
  ChevronRight, Loader2, TrendingUp, Calendar,
} from 'lucide-react';

const API_URL = 'http://127.0.0.1:8002/api/v1';
const MOCK_USER = 'user_123';

interface Subject {
  id: string;
  name: string;
}

export default function JourneySetupPage() {
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [alreadyDone, setAlreadyDone] = useState<number | null>(null);

  // Form state
  const [goal, setGoal] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [studySpan, setStudySpan] = useState<2 | 6 | 10>(6);
  const [weeklyHours, setWeeklyHours] = useState(10);
  const [sessionMinutes, setSessionMinutes] = useState(60);
  const [difficulty, setDifficulty] = useState<'standard' | 'accelerated' | 'deep_dive'>('standard');
  const [step, setStep] = useState(1); // multi-step wizard

  // Load subjects
  useEffect(() => {
    setLoading(true);
    axios.get(`${API_URL}/graph/curriculum`)
      .then(res => {
        const data = res.data || [];
        const unique: Subject[] = [];
        for (const curr of data) {
          for (const sub of curr.subjects || []) {
            if (!unique.find(s => s.id === sub.id)) unique.push({ id: sub.id, name: sub.name });
          }
        }
        setSubjects(unique);
      })
      .catch(() => setError('Failed to load subjects'))
      .finally(() => setLoading(false));
  }, []);

  const toggleSubject = (id: string) => {
    setSelectedSubjects(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const handleGenerate = async () => {
    if (!goal.trim()) { setError('Please enter a goal.'); return; }
    if (selectedSubjects.length === 0) { setError('Select at least one subject.'); return; }
    setError('');
    setAlreadyDone(null);
    setGenerating(true);
    try {
      const res = await axios.post(`${API_URL}/journey/generate`, {
        user_id: MOCK_USER,
        goal: goal.trim(),
        subject_ids: selectedSubjects,
        study_span_months: studySpan,
        weekly_hours: weeklyHours,
        session_minutes: sessionMinutes,
        difficulty,
      });
      const { journey_id, already_completed } = res.data;
      setAlreadyDone(already_completed || 0);
      // Brief delay so user sees the count before navigating
      setTimeout(() => navigate(`/journey/${journey_id}`), 1200);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to generate journey. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const spanOptions = [
    { value: 2, label: '1–3 months', desc: 'Sprint' },
    { value: 6, label: '4–8 months', desc: 'Steady' },
    { value: 10, label: '9–12 months', desc: 'Deep Dive' },
  ];

  const difficultyOptions = [
    { value: 'standard', label: 'Standard', desc: 'Gradual linear increase', icon: '📈' },
    { value: 'accelerated', label: 'Accelerated', desc: 'Fewer hours, focused topics', icon: '⚡' },
    { value: 'deep_dive', label: 'Deep Dive', desc: 'Comprehensive coverage', icon: '🔬' },
  ];

  const goalExamples = [
    'Prepare for NEET 2025',
    'Score 90%+ in Biology',
    'Master Physics fundamentals',
    'Clear JEE Foundation',
  ];

  // Step-based render
  const steps = [
    { num: 1, label: 'Goal', icon: <Target size={14} /> },
    { num: 2, label: 'Subjects', icon: <BookOpen size={14} /> },
    { num: 3, label: 'Schedule', icon: <Calendar size={14} /> },
    { num: 4, label: 'Generate', icon: <Zap size={14} /> },
  ];

  return (
    <div className="animate-fade-in" style={{ maxWidth: '760px', margin: '0 auto', paddingBottom: '60px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '12px',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(16,185,129,0.15))',
          border: '1px solid rgba(99,102,241,0.3)', borderRadius: '16px', padding: '10px 20px', marginBottom: '20px',
        }}>
          <TrendingUp size={20} color="#6366f1" />
          <span style={{ color: '#6366f1', fontWeight: 600, fontSize: '0.9rem', letterSpacing: '0.04em' }}>
            LEARNING JOURNEY
          </span>
        </div>
        <h1 className="page-title" style={{ margin: '0 0 8px', fontSize: '2.2rem', background: 'linear-gradient(135deg, #fff, #6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Design Your Path to Mastery
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', margin: 0 }}>
          Tell us your goal — we'll build a personalized, prerequisite-ordered study journey.
        </p>
      </div>

      {/* Step Progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: '40px', justifyContent: 'center' }}>
        {steps.map((s, i) => (
          <div key={s.num} style={{ display: 'flex', alignItems: 'center' }}>
            <button
              onClick={() => s.num <= step && setStep(s.num)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '7px 14px', borderRadius: '20px', border: 'none', cursor: s.num <= step ? 'pointer' : 'default',
                background: step === s.num
                  ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                  : step > s.num ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)',
                color: step === s.num ? 'white' : step > s.num ? '#10b981' : 'var(--text-secondary)',
                fontSize: '0.8rem', fontWeight: 600, transition: 'all 0.2s',
              }}
            >
              {s.icon} {s.label}
            </button>
            {i < steps.length - 1 && (
              <div style={{ width: '32px', height: '2px', background: step > s.num ? '#10b981' : 'rgba(255,255,255,0.1)' }} />
            )}
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', color: '#fca5a5', marginBottom: '20px', fontSize: '0.85rem' }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── STEP 1: Goal ── */}
      {step === 1 && (
        <div className="glass-panel animate-fade-in" style={{ padding: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Target size={18} color="#6366f1" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'white' }}>What's your goal?</h2>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Be as specific as you like</p>
            </div>
          </div>

          <textarea
            value={goal}
            onChange={e => setGoal(e.target.value)}
            placeholder="e.g. Prepare for NEET 2025, Improve grades in Physics..."
            rows={3}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '12px', padding: '14px 16px', color: 'white', fontSize: '1rem',
              resize: 'none', outline: 'none', boxSizing: 'border-box', lineHeight: 1.6,
              transition: 'border-color 0.2s',
            }}
            onFocus={e => e.target.style.borderColor = '#6366f1'}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
          />

          <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', margin: '12px 0 8px' }}>Quick examples:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '28px' }}>
            {goalExamples.map(ex => (
              <button key={ex} onClick={() => setGoal(ex)} style={{
                padding: '5px 12px', borderRadius: '20px', border: '1px solid rgba(99,102,241,0.3)',
                background: 'rgba(99,102,241,0.08)', color: '#a5b4fc', fontSize: '0.78rem',
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
                {ex}
              </button>
            ))}
          </div>

          <button
            onClick={() => { if (!goal.trim()) { setError('Please enter a goal.'); return; } setError(''); setStep(2); }}
            className="btn btn-primary"
            style={{ width: '100%', padding: '14px', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            Next: Choose Subjects <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* ── STEP 2: Subjects ── */}
      {step === 2 && (
        <div className="glass-panel animate-fade-in" style={{ padding: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BookOpen size={18} color="#6366f1" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'white' }}>Select subjects</h2>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Choose all subjects you want to cover</p>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              <Loader2 size={28} style={{ animation: 'spin 0.8s linear infinite', margin: '0 auto 12px', display: 'block' }} />
              Loading subjects...
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '28px' }}>
              {subjects.map((sub, i) => {
                const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#0ea5e9'];
                const color = colors[i % colors.length];
                const isSelected = selectedSubjects.includes(sub.id);
                return (
                  <button
                    key={sub.id}
                    onClick={() => toggleSubject(sub.id)}
                    style={{
                      padding: '16px', borderRadius: '12px', cursor: 'pointer', textAlign: 'left',
                      border: isSelected ? `1.5px solid ${color}` : '1px solid rgba(255,255,255,0.1)',
                      background: isSelected ? `${color}22` : 'rgba(255,255,255,0.04)',
                      color: isSelected ? color : 'var(--text-secondary)',
                      transition: 'all 0.2s', fontSize: '0.9rem', fontWeight: 600,
                    }}
                  >
                    <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px', fontSize: '16px' }}>
                      {isSelected ? '✓' : '○'}
                    </div>
                    {sub.name}
                  </button>
                );
              })}
            </div>
          )}

          {selectedSubjects.length > 0 && (
            <p style={{ color: '#10b981', fontSize: '0.8rem', marginBottom: '16px' }}>
              ✓ {selectedSubjects.length} subject{selectedSubjects.length > 1 ? 's' : ''} selected
            </p>
          )}

          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => setStep(1)} style={{ padding: '12px 24px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.9rem' }}>
              Back
            </button>
            <button
              onClick={() => { if (selectedSubjects.length === 0) { setError('Select at least one subject.'); return; } setError(''); setStep(3); }}
              className="btn btn-primary"
              style={{ flex: 1, padding: '12px', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              Next: Study Schedule <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Schedule ── */}
      {step === 3 && (
        <div className="glass-panel animate-fade-in" style={{ padding: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '28px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={18} color="#6366f1" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'white' }}>Study preferences</h2>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>We'll build your schedule around these</p>
            </div>
          </div>

          {/* Study Span */}
          <div style={{ marginBottom: '28px' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>Study Span</p>
            <div style={{ display: 'flex', gap: '12px' }}>
              {spanOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setStudySpan(opt.value as any)}
                  style={{
                    flex: 1, padding: '14px 8px', borderRadius: '12px', cursor: 'pointer', textAlign: 'center',
                    border: studySpan === opt.value ? '1.5px solid #6366f1' : '1px solid rgba(255,255,255,0.1)',
                    background: studySpan === opt.value ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                    color: studySpan === opt.value ? '#a5b4fc' : 'var(--text-secondary)',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '2px' }}>{opt.label}</div>
                  <div style={{ fontSize: '0.72rem', opacity: 0.7 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty */}
          <div style={{ marginBottom: '28px' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>Difficulty Level</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {difficultyOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setDifficulty(opt.value as any)}
                  style={{
                    padding: '12px 16px', borderRadius: '12px', cursor: 'pointer', textAlign: 'left',
                    border: difficulty === opt.value ? '1.5px solid #6366f1' : '1px solid rgba(255,255,255,0.08)',
                    background: difficulty === opt.value ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)',
                    color: 'white', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '12px',
                  }}
                >
                  <span style={{ fontSize: '1.2rem' }}>{opt.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{opt.label}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{opt.desc}</div>
                  </div>
                  {difficulty === opt.value && <div style={{ marginLeft: 'auto', color: '#6366f1', fontSize: '1.1rem' }}>✓</div>}
                </button>
              ))}
            </div>
          </div>

          {/* Sliders */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '28px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Session Duration</span>
                <span style={{ color: '#6366f1', fontWeight: 700, fontSize: '0.9rem' }}>
                  {sessionMinutes >= 60 ? `${sessionMinutes / 60}h` : `${sessionMinutes}m`}
                </span>
              </div>
              <input type="range" min={15} max={240} step={15} value={sessionMinutes}
                onChange={e => setSessionMinutes(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#6366f1' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                <span>15m</span><span>4h</span>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Weekly Study Hours</span>
                <span style={{ color: '#6366f1', fontWeight: 700, fontSize: '0.9rem' }}>{weeklyHours}h</span>
              </div>
              <input type="range" min={1} max={50} step={1} value={weeklyHours}
                onChange={e => setWeeklyHours(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#6366f1' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                <span>1h</span><span>50h</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => setStep(2)} style={{ padding: '12px 24px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.9rem' }}>
              Back
            </button>
            <button onClick={() => { setError(''); setStep(4); }} className="btn btn-primary"
              style={{ flex: 1, padding: '12px', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              Review & Generate <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Review & Generate ── */}
      {step === 4 && (
        <div className="glass-panel animate-fade-in" style={{ padding: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '28px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={18} color="#10b981" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'white' }}>Ready to generate</h2>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Your personalized learning journey</p>
            </div>
          </div>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '28px' }}>
            {[
              { label: 'Goal', value: goal, icon: '🎯' },
              { label: 'Subjects', value: subjects.filter(s => selectedSubjects.includes(s.id)).map(s => s.name).join(', '), icon: '📚' },
              { label: 'Study Span', value: spanOptions.find(s => s.value === studySpan)?.label || '', icon: '📅' },
              { label: 'Weekly Hours', value: `${weeklyHours}h/week`, icon: '⏰' },
              { label: 'Session Duration', value: sessionMinutes >= 60 ? `${sessionMinutes / 60}h sessions` : `${sessionMinutes}m sessions`, icon: '⌛' },
              { label: 'Difficulty', value: difficultyOptions.find(d => d.value === difficulty)?.label || '', icon: '🎓' },
            ].map(item => (
              <div key={item.label} style={{ padding: '14px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
                  {item.icon} {item.label}
                </div>
                <div style={{ color: 'white', fontWeight: 600, fontSize: '0.88rem', lineHeight: 1.4 }}>{item.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => setStep(3)} style={{ padding: '12px 24px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.9rem' }}>
              Back
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              style={{
                flex: 1, padding: '16px', borderRadius: '12px', border: 'none', cursor: generating ? 'wait' : 'pointer',
                background: generating ? 'rgba(16,185,129,0.1)' : 'linear-gradient(135deg, #10b981, #6366f1)',
                color: 'white', fontWeight: 700, fontSize: '1rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                boxShadow: generating ? 'none' : '0 8px 20px rgba(99,102,241,0.4)',
                transition: 'all 0.3s',
              }}
            >
              {generating ? (
                <><Loader2 size={20} style={{ animation: 'spin 0.8s linear infinite' }} /> Analyzing your goals...</>
              ) : alreadyDone !== null ? (
                <><span>🎉</span> {alreadyDone > 0 ? `${alreadyDone} topics already done!` : 'Journey ready!'}</>
              ) : (
                <><Zap size={20} /> Generate My Learning Journey</>
              )}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
