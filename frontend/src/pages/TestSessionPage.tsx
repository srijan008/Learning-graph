import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { Flag, ChevronLeft, ChevronRight, Clock, CheckCircle2, HelpCircle, SkipForward, AlertCircle } from 'lucide-react';
import MathText from '../components/MathText';

const API = 'http://127.0.0.1:8002/api/v1';
const USER = 'user_123';

interface Option { label: string; text: string }
interface Question {
  id: string; question: string; options: Option[];
  chapter: string; chapter_name: string; subject: string; year: string; difficulty: string; image?: boolean;
}

type QuestionState = 'unanswered' | 'answered' | 'flagged' | 'skipped';

interface AnswerMap { [qid: string]: { selected_option: string | null; time_taken_ms: number; flagged: boolean } }

const DIFFICULTY_COLORS: Record<string, string> = { easy: '#10b981', medium: '#f59e0b', hard: '#ef4444' };
const SUBJECT_COLORS: Record<string, string> = { physics: '#6366f1', chemistry: '#10b981', botany: '#84cc16', zoology: '#f59e0b' };

export default function TestSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const initData = location.state as any;

  const [questions, setQuestions] = useState<Question[]>(initData?.questions || []);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [timeRemainingMs, setTimeRemainingMs] = useState((initData?.time_limit_mins || 30) * 60 * 1000);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [loading, setLoading] = useState(!initData?.questions);
  const [submitting, setSubmitting] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [questionElapsedMs, setQuestionElapsedMs] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const questionStartTimeRef = useRef<number>(Date.now());

  // Enter fullscreen when test loads
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => { document.exitFullscreen?.().catch(() => {}); };
  }, []);

  // Load session if no init data (resume)
  useEffect(() => {
    if (!initData?.questions && sessionId) {
      axios.get(`${API}/test/session/${sessionId}`).then(res => {
        const d = res.data;
        setQuestions(d.questions || []);
        setAnswers(d.answers || {});
        setCurrentIdx(d.current_question_index || 0);
        setTimeRemainingMs(d.time_remaining_ms || 30 * 60 * 1000);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [sessionId, initData]);

  // WebSocket connection
  useEffect(() => {
    if (!sessionId) return;
    const wsUrl = `ws://127.0.0.1:8002/api/v1/test/ws/${sessionId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setWsConnected(true);
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'timer') setTimeRemainingMs(data.time_remaining_ms);
        if (data.type === 'expired') handleAutoSubmit();
      } catch (_) {}
    };
    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);

    // Heartbeat every 5 seconds
    const hb = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'heartbeat' }));
      }
    }, 5000);

    return () => { clearInterval(hb); ws.close(); };
  }, [sessionId]);

  // Local timer fallback when WS is down
  useEffect(() => {
    if (wsConnected) return;
    const interval = setInterval(() => {
      setTimeRemainingMs(prev => {
        if (prev <= 1000) { handleAutoSubmit(); return 0; }
        return prev - 1000;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [wsConnected]);

  // Track time per question — reset stopwatch on navigation
  useEffect(() => {
    questionStartTimeRef.current = Date.now();
    setQuestionElapsedMs(0);
    const iv = setInterval(() => {
      setQuestionElapsedMs(Date.now() - questionStartTimeRef.current);
    }, 500);
    return () => clearInterval(iv);
  }, [currentIdx]);

  const currentQuestion = questions[currentIdx];

  const getQuestionState = (q: Question): QuestionState => {
    const a = answers[q.id];
    if (!a) return 'unanswered';
    if (a.flagged) return 'flagged';
    if (a.selected_option === null) return 'skipped';
    return 'answered';
  };

  const selectAnswer = useCallback(async (option: string | null, flag = false) => {
    if (!currentQuestion) return;
    const elapsed = Date.now() - questionStartTimeRef.current;
    const newAnswer = { selected_option: option, time_taken_ms: elapsed, flagged: flag };

    setAnswers(prev => ({ ...prev, [currentQuestion.id]: newAnswer }));

    // Debounced auto-save
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        await axios.patch(`${API}/test/session/${sessionId}/answer`, {
          question_id: currentQuestion.id,
          selected_option: option,
          time_taken_ms: elapsed,
          flagged: flag,
        });
      } catch (_) {}
    }, 600);
  }, [currentQuestion, sessionId, questionStartTime]);

  const toggleFlag = () => {
    const a = answers[currentQuestion.id];
    selectAnswer(a?.selected_option ?? null, !(a?.flagged ?? false));
  };

  const handleAutoSubmit = async () => { await submitTest(true); };

  const submitTest = async (auto = false) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/test/session/${sessionId}/submit`, { user_id: USER });
      navigate(`/test/results/${res.data.report_id}`, { state: res.data });
    } catch (e: any) {
      if (e.response?.data?.detail?.includes('already_submitted') || e.response?.data?.report_id) {
        navigate(`/test/results/${e.response.data.report_id}`);
      }
    }
  };

  const formatTime = (ms: number) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  };

  const answeredCount = Object.values(answers).filter(a => a.selected_option !== null).length;
  const flaggedCount = Object.values(answers).filter(a => a.flagged).length;
  const skippedCount = Object.values(answers).filter(a => a.selected_option === null && a.flagged === false).length - 0; // simplified
  const timerUrgent = timeRemainingMs < 300000; // < 5 min
  const timerColor = timeRemainingMs < 60000 ? '#ef4444' : timeRemainingMs < 300000 ? '#f59e0b' : '#10b981';

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-secondary)' }}>
      Loading test session...
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg-primary)' }}>
      {/* Top Bar */}
      <div style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', background: 'rgba(10,12,16,0.98)', flexShrink: 0, height: '52px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>Q {currentIdx + 1} / {questions.length}</span>
          <div style={{ height: '3px', width: '100px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${((currentIdx + 1) / questions.length) * 100}%`, background: 'var(--accent-primary)', borderRadius: '4px', transition: 'width 0.3s' }} />
          </div>
        </div>

        {/* Timer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 16px', borderRadius: '20px', background: `${timerColor}15`, border: `1px solid ${timerColor}40` }}>
          <Clock size={14} color={timerColor} />
          <span style={{ color: timerColor, fontWeight: 700, fontFamily: 'monospace', fontSize: '1rem', minWidth: '60px' }}>{formatTime(timeRemainingMs)}</span>
          {timerUrgent && <AlertCircle size={12} color={timerColor} className="pulse-dot" />}
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ padding: '4px 12px', borderRadius: '20px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={11} color="var(--text-secondary)" />
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontFamily: 'monospace' }}>
              {String(Math.floor(questionElapsedMs / 60000)).padStart(2,'0')}:{String(Math.floor((questionElapsedMs % 60000) / 1000)).padStart(2,'0')}
            </span>
          </div>
          <button onClick={() => setShowConfirm(true)} style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', border: 'none', color: 'white', padding: '6px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
            Submit
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Main Question Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', display: 'flex', flexDirection: 'column' }}>
          {currentQuestion && (
            <>
              {/* Question Meta */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '0.72rem', background: `${SUBJECT_COLORS[currentQuestion.subject] || '#6366f1'}20`, color: SUBJECT_COLORS[currentQuestion.subject] || '#6366f1', fontWeight: 600 }}>
                  {currentQuestion.subject.charAt(0).toUpperCase() + currentQuestion.subject.slice(1)}
                </span>
                <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '0.72rem', background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
                  {currentQuestion.chapter_name}
                </span>
                <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '0.72rem', background: `${DIFFICULTY_COLORS[currentQuestion.difficulty]}20`, color: DIFFICULTY_COLORS[currentQuestion.difficulty] }}>
                  {currentQuestion.difficulty}
                </span>
                <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '0.72rem', background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
                  {currentQuestion.year}
                </span>
              </div>

              {/* Question Text */}
              <div className="question-text" style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '20px 24px', marginBottom: '20px', border: '1px solid rgba(255,255,255,0.08)', lineHeight: 1.9, color: 'white', fontSize: '0.97rem' }}>
                <MathText text={currentQuestion.question} />
              </div>

              {/* Options */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
                {(currentQuestion.options || []).map((opt) => {
                  const selected = answers[currentQuestion.id]?.selected_option === opt.label;
                  return (
                    <button
                      key={opt.label}
                      onClick={() => selectAnswer(opt.label)}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '14px 18px',
                        borderRadius: '10px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
                        border: selected ? '1.5px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.08)',
                        background: selected ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
                      }}
                      onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
                      onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                    >
                      <span style={{
                        width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, fontWeight: 700, fontSize: '0.82rem',
                        background: selected ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)',
                        color: selected ? 'white' : 'var(--text-secondary)',
                      }}>
                        {opt.label}
                      </span>
                      <span className="question-text" style={{ color: selected ? 'white' : 'rgba(255,255,255,0.75)', lineHeight: 1.7, fontSize: '0.9rem', paddingTop: '4px', flex: 1 }}>
                        <MathText text={opt.text} />
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Navigation */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <button onClick={() => setCurrentIdx(i => Math.max(0, i - 1))} disabled={currentIdx === 0} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', cursor: currentIdx === 0 ? 'not-allowed' : 'pointer', opacity: currentIdx === 0 ? 0.4 : 1 }}>
                  <ChevronLeft size={16} /> Previous
                </button>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={toggleFlag} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', borderRadius: '8px', border: `1px solid ${answers[currentQuestion.id]?.flagged ? '#f59e0b' : 'var(--border-color)'}`, background: answers[currentQuestion.id]?.flagged ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.04)', color: answers[currentQuestion.id]?.flagged ? '#f59e0b' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem' }}>
                    <Flag size={14} /> {answers[currentQuestion.id]?.flagged ? 'Flagged' : 'Flag'}
                  </button>
                  <button onClick={() => selectAnswer(null)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem' }}>
                    <SkipForward size={14} /> Skip
                  </button>
                </div>
                <button onClick={() => { if (currentIdx < questions.length - 1) setCurrentIdx(i => i + 1); else setShowConfirm(true); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '8px', border: 'none', background: 'var(--accent-primary)', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                  {currentIdx < questions.length - 1 ? <><span>Next</span><ChevronRight size={16} /></> : <span>Finish</span>}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Always-Visible Question Palette Sidebar */}
        <div style={{ width: '200px', borderLeft: '1px solid var(--border-color)', overflowY: 'auto', padding: '14px', background: 'rgba(10,12,16,0.7)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Stats Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {[
              { label: 'Answered', val: answeredCount, color: '#10b981' },
              { label: 'Flagged', val: flaggedCount, color: '#f59e0b' },
              { label: 'Pending', val: questions.length - answeredCount, color: '#6b7280' },
              { label: 'Total', val: questions.length, color: 'var(--accent-primary)' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center', padding: '6px', borderRadius: '6px', background: `${s.color}12` }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Question Grid */}
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Questions</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '5px' }}>
            {questions.map((q, i) => {
              const state = getQuestionState(q);
              const colors: Record<QuestionState, string> = { answered: '#10b981', flagged: '#f59e0b', skipped: '#6b7280', unanswered: 'rgba(255,255,255,0.06)' };
              const textColors: Record<QuestionState, string> = { answered: 'white', flagged: 'white', skipped: '#aaa', unanswered: 'var(--text-secondary)' };
              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentIdx(i)}
                  title={`Q${i+1}: ${state}`}
                  style={{
                    width: '36px', height: '30px', borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer',
                    border: i === currentIdx ? '2px solid var(--accent-primary)' : '1px solid transparent',
                    background: colors[state], color: textColors[state],
                    transition: 'all 0.15s',
                    boxShadow: i === currentIdx ? '0 0 8px rgba(99,102,241,0.5)' : 'none',
                  }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {[
              { color: '#10b981', label: 'Answered' },
              { color: '#f59e0b', label: 'Flagged' },
              { color: '#6b7280', label: 'Skipped' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.68rem' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: l.color, flexShrink: 0 }} />
                <span style={{ color: 'var(--text-secondary)' }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Submit Confirmation Modal */}
      {showConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ padding: '32px', maxWidth: '400px', width: '90%', textAlign: 'center' }}>
            <AlertCircle size={40} color="#f59e0b" style={{ marginBottom: '16px' }} />
            <h3 style={{ color: 'white', marginBottom: '8px' }}>Submit Test?</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
              You've answered <strong style={{ color: 'white' }}>{answeredCount}</strong> of <strong style={{ color: 'white' }}>{questions.length}</strong> questions.
              {(questions.length - answeredCount) > 0 && ` ${questions.length - answeredCount} unanswered.`}
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setShowConfirm(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.06)', color: 'white', cursor: 'pointer' }}>
                Continue Test
              </button>
              <button onClick={() => submitTest()} disabled={submitting} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: submitting ? 'rgba(99,102,241,0.5)' : 'var(--accent-primary)', color: 'white', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                {submitting ? 'Submitting...' : 'Confirm Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .pulse-dot { animation: pulse 1s infinite; }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  );
}
