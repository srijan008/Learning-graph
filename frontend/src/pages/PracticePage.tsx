import { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import {
  Play, Timer, Maximize2, Minimize2, ChevronLeft, ChevronRight,
  CheckCircle, XCircle, AlertCircle, Send, RotateCcw, Trophy,
  BookOpen, Layers, Target, ChevronDown, Sparkles, FileText
} from 'lucide-react';

const API_URL = 'http://127.0.0.1:8002/api/v1';
const DEFAULT_DURATION = 30 * 60; // 30 minutes in seconds

interface CurriculumNode { id: string; name: string; subjects: SubjectNode[]; }
interface SubjectNode { id: string; name: string; chapters: ChapterNode[]; }
interface ChapterNode  { id: string; name: string; topics: TopicNode[]; }
interface TopicNode    { id: string; name: string; }

import { fetchCurriculum } from '../utils/api_cache';

type QuestionStatus = 'unattempted' | 'answered' | 'reviewing' | 'correct' | 'wrong' | 'grading';
interface QuestionState {
  status: QuestionStatus;
  userAnswer: string;
  feedback: string;
  solution?: string;
}

export default function PracticePage() {
  // --- Curriculum hierarchy ---
  const [curriculums, setCurriculums] = useState<CurriculumNode[]>([]);
  const [selCurriculum, setSelCurriculum] = useState<CurriculumNode | null>(null);
  const [selSubject, setSelSubject] = useState<SubjectNode | null>(null);
  const [selChapter, setSelChapter] = useState<ChapterNode | null>(null);
  const [selTopic, setSelTopic]     = useState<TopicNode | null>(null);
  const [loadingCurriculum, setLoadingCurriculum] = useState(false);

  // --- Test state ---
  const [testStarted, setTestStarted] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);
  const [qStates, setQStates] = useState<QuestionState[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // --- Timer state ---
  const [timeLeft, setTimeLeft] = useState(DEFAULT_DURATION);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Fullscreen state ---
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  // Load curriculum hierarchy
  useEffect(() => {
    setLoadingCurriculum(true);
    fetchCurriculum().then(data => {
      setCurriculums(data);
      if (data.length > 0) {
        const savedStr = localStorage.getItem('practice_selections');
        const savedSel = savedStr ? JSON.parse(savedStr) : {};
        
        let c = data.find(x => x.id === savedSel.curriculumId) || data[0];
        setSelCurriculum(c);
        
        let s = c?.subjects?.find(x => x.id === savedSel.subjectId) || c?.subjects?.[0] || null;
        setSelSubject(s);
        
        let ch = s?.chapters?.find(x => x.id === savedSel.chapterId) || s?.chapters?.[0] || null;
        setSelChapter(ch);
        
        let t = ch?.topics?.find(x => x.id === savedSel.topicId) || ch?.topics?.[0] || null;
        setSelTopic(t);
      }
      setLoadingCurriculum(false);
    }).catch(e => {
      setError(e.message);
      setLoadingCurriculum(false);
    });
  }, []);

  // Cascading auto-select & clear
  useEffect(() => {
    if (selCurriculum && selCurriculum.subjects) {
      if (!selCurriculum.subjects.find(s => s.id === selSubject?.id)) {
        setSelSubject(selCurriculum.subjects[0] || null);
      }
    }
  }, [selCurriculum]);

  useEffect(() => {
    if (selSubject && selSubject.chapters) {
      if (!selSubject.chapters.find(c => c.id === selChapter?.id)) {
        setSelChapter(selSubject.chapters[0] || null);
      }
    } else {
      setSelChapter(null);
    }
  }, [selSubject]);

  useEffect(() => {
    if (selChapter && selChapter.topics) {
      if (!selChapter.topics.find(t => t.id === selTopic?.id)) {
        setSelTopic(selChapter.topics[0] || null);
      }
    } else {
      setSelTopic(null);
    }
  }, [selChapter]);

  // Save to localStorage when selections change
  useEffect(() => {
    const isReady = curriculums.length > 0;
    if (isReady && (selCurriculum || selSubject || selChapter || selTopic)) {
      localStorage.setItem('practice_selections', JSON.stringify({
        curriculumId: selCurriculum?.id,
        subjectId: selSubject?.id,
        chapterId: selChapter?.id,
        topicId: selTopic?.id
      }));
    }
  }, [selCurriculum, selSubject, selChapter, selTopic, curriculums]);
  // Timer logic
  useEffect(() => {
    if (timerRunning && timeLeft > 0) {
      timerRef.current = setInterval(() => setTimeLeft(t => t - 1), 1000);
    } else if (timeLeft === 0 && timerRunning) {
      setTimerRunning(false);
      handleFinish();
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning, timeLeft]);

  const handleFinish = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      const payload = {
        user_id: 'user_123',
        curriculum: 'NEET',
        subject_id: selSubject?.id,
        chapter_id: selChapter?.id,
        topic_id: selTopic?.id,
        subtopic_name: selTopic?.name,
        answers: qStates.map((s, idx) => ({
          question_id: questions[idx].id,
          selected_option: s.userAnswer,
          time_taken: 0
        }))
      };
      
      const res = await axios.post(`${API_URL}/practice/finish`, payload);
      const data = res.data;
      
      if (data.status === 'success') {
        const newStates = [...qStates];
        data.results.forEach((r: any) => {
          const idx = questions.findIndex(q => q.id === r.question_id);
          if (idx !== -1) {
            newStates[idx] = {
              ...newStates[idx],
              status: r.is_correct ? 'correct' : 'wrong',
              feedback: r.is_correct ? 'Correct!' : `The correct answer is ${r.correct_answer}.`,
              solution: r.solution_text
            };
          }
        });
        setQStates(newStates);
        setTestResult(data);
        setSubmitted(true);
        setTimerRunning(false);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to finish test');
    } finally {
      setFinishing(false);
    }
  };

  // Fullscreen API
  const containerRef = useRef<HTMLDivElement>(null);
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const startTest = async () => {
    if (!selTopic) return;
    setLoading(true);
    setError('');
    try {
      // Use the topic id for fetching questions
      const res = await axios.get(`${API_URL}/practice/questions/NEET/${selTopic.id}?limit=10&subtopic_name=${encodeURIComponent(selTopic.name)}${selSubject ? `&subject_id=${selSubject.id}` : ''}`);
      const qs = res.data.questions || [];
      if (qs.length === 0) {
        setError('No questions found for this topic. Our AI is preparing more content, please try another topic.');
        setLoading(false);
        return;
      }
      setQuestions(qs);
      setQStates(qs.map(() => ({ status: 'unattempted' as QuestionStatus, userAnswer: '', feedback: '' })));
      setCurrentIdx(0);
      setTimeLeft(DEFAULT_DURATION);
      setSubmitted(false);
      setTestStarted(true);
      setTimerRunning(true);
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  };

  const updateQ = (idx: number, patch: Partial<QuestionState>) =>
    setQStates(prev => prev.map((q, i) => i === idx ? { ...q, ...patch } : q));



  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const statusColors: Record<QuestionStatus, string> = {
    unattempted: '#475569',
    answered: '#3b82f6',
    reviewing: '#f59e0b',
    correct: '#10b981',
    wrong: '#ef4444',
    grading: '#8b5cf6',
  };

  const timerColor = timeLeft < 300 ? '#ef4444' : timeLeft < 600 ? '#f59e0b' : '#10b981';

  // ===================== PRE-TEST SCREEN =====================
  if (!testStarted) {
    return (
      <div className="animate-fade-in" style={{ maxWidth: '1000px', margin: '0 auto', padding: '0 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
            <Trophy size={40} color="var(--accent-primary)" />
            <h1 className="page-title" style={{ margin: 0, fontSize: '2.5rem' }}>Practice Lab</h1>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', maxWidth: '600px', margin: '0 auto' }}>
            Master your curriculum with our test environment. Timer, fullscreen focus, and instant AI evaluation.
          </p>
        </div>

        {loadingCurriculum ? (
          <div style={{ textAlign: 'center', padding: '100px', color: 'var(--text-secondary)' }}>
            <div style={{ width: '40px', height: '40px', border: '3px solid var(--accent-primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 20px' }} />
            Initializing Curriculum...
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '28px', marginBottom: '40px' }}>
            
            {/* Hierarchical Picker */}
            <div className="glass-panel" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
                <Layers size={20} color="var(--accent-secondary)" />
                <h3 style={{ margin: 0, color: 'white', fontSize: '1.1rem' }}>Select Topic to Practice</h3>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr 1.5fr', gap: '16px', height: '360px' }}>
                {/* Curriculum */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', paddingRight: '4px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Curriculum</span>
                  {curriculums.map(c => (
                    <button key={c.id} onClick={() => setSelCurriculum(c)}
                      style={{
                        textAlign: 'left', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem',
                        border: '1px solid ' + (selCurriculum?.id === c.id ? 'var(--accent-primary)' : 'transparent'),
                        background: selCurriculum?.id === c.id ? 'rgba(99,102,241,0.15)' : 'transparent',
                        color: selCurriculum?.id === c.id ? 'white' : 'var(--text-secondary)',
                        transition: 'all 0.15s'
                      }}>
                      {c.name}
                    </button>
                  ))}
                </div>

                {/* Subjects */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', paddingRight: '4px', borderLeft: '1px solid var(--border-color)', paddingLeft: '12px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Subject</span>
                  {selCurriculum?.subjects?.map(s => (
                    <button key={s.id} onClick={() => setSelSubject(s)}
                      style={{
                        textAlign: 'left', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem',
                        border: '1px solid ' + (selSubject?.id === s.id ? 'var(--accent-primary)' : 'transparent'),
                        background: selSubject?.id === s.id ? 'rgba(99,102,241,0.15)' : 'transparent',
                        color: selSubject?.id === s.id ? 'white' : 'var(--text-secondary)',
                        transition: 'all 0.15s'
                      }}>
                      {s.name}
                    </button>
                  ))}
                </div>

                {/* Chapters */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', paddingRight: '4px', borderLeft: '1px solid var(--border-color)', paddingLeft: '12px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Chapter</span>
                  {selSubject?.chapters.map(c => (
                    <button key={c.id} onClick={() => setSelChapter(c)}
                      style={{
                        textAlign: 'left', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem',
                        border: '1px solid ' + (selChapter?.id === c.id ? 'var(--accent-secondary)' : 'transparent'),
                        background: selChapter?.id === c.id ? 'rgba(16,185,129,0.1)' : 'transparent',
                        color: selChapter?.id === c.id ? 'white' : 'var(--text-secondary)',
                        transition: 'all 0.15s'
                      }}>
                      {c.name}
                    </button>
                  ))}
                </div>

                {/* Topics */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', paddingRight: '4px', borderLeft: '1px solid var(--border-color)', paddingLeft: '12px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Topic</span>
                  {selChapter?.topics.map(t => (
                    <button key={t.id} onClick={() => setSelTopic(t)}
                      style={{
                        textAlign: 'left', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem',
                        border: '1px solid ' + (selTopic?.id === t.id ? 'white' : 'transparent'),
                        background: selTopic?.id === t.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                        color: selTopic?.id === t.id ? 'white' : 'var(--text-secondary)',
                        transition: 'all 0.15s'
                      }}>
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Test Summary & Action */}
            <div className="glass-panel" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px', background: 'rgba(30,41,59,0.7)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Target size={20} color="var(--accent-primary)" />
                <h3 style={{ margin: 0, color: 'white', fontSize: '1.1rem' }}>Test Bundle</h3>
              </div>

              {selTopic ? (
                <div style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '12px', padding: '16px' }}>
                  <p style={{ margin: 0, color: 'var(--accent-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '4px' }}>Ready to start</p>
                  <p style={{ margin: 0, color: 'white', fontWeight: 600, fontSize: '1.05rem', lineHeight: 1.4 }}>{selTopic.name}</p>
                </div>
              ) : (
                <div style={{ padding: '20px', textAlign: 'center', border: '1px dashed var(--border-color)', borderRadius: '12px' }}>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Pick a topic to unlock the test</p>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {[
                  { label: 'Total Questions', value: '10 Mixed Type' },
                  { label: 'Time Allowed', value: '30 Minutes' },
                  { label: 'Proctoring', value: 'Fullscreen Only' },
                  { label: 'AI Evaluation', value: 'Enabled' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{label}</span>
                    <span style={{ color: 'white', fontSize: '0.85rem', fontWeight: 500 }}>{value}</span>
                  </div>
                ))}
              </div>

              {error && (
                <div style={{ padding: '12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', display: 'flex', gap: '10px' }}>
                  <AlertCircle size={16} color="#ef4444" style={{ flexShrink: 0 }} />
                  <p style={{ color: '#fca5a5', fontSize: '0.8rem', margin: 0 }}>{error}</p>
                </div>
              )}

              <button
                className="btn btn-primary"
                onClick={startTest}
                disabled={!selTopic || loading}
                style={{ 
                  marginTop: 'auto', padding: '16px', fontSize: '1.1rem', fontWeight: 700, 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
                  boxShadow: '0 10px 15px -3px rgba(99, 102, 241, 0.3)',
                }}
              >
                {loading ? 'Generating Test...' : <><Play size={20} fill="currentColor" /> ENTER LAB</>}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===================== TEST SCREEN =====================
  const currentQ = questions[currentIdx];
  const currentQState = qStates[currentIdx];

  return (
    <div ref={containerRef} style={{
      display: 'flex', flexDirection: 'column', height: isFullscreen ? '100vh' : 'calc(100vh - 80px)',
      background: '#0f172a', overflow: 'hidden', color: 'white'
    }}>

      {/* TOP HEADER */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: '64px', flexShrink: 0,
        background: 'rgba(15,23,42,0.9)', borderBottom: '1px solid var(--border-color)',
        backdropFilter: 'blur(12px)', zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Trophy size={20} color="var(--accent-primary)" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: 'white', fontWeight: 600, fontSize: '0.95rem', lineHeight: 1.2 }}>
              {selTopic?.name}
            </span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {selChapter?.name}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(0,0,0,0.3)', padding: '8px 16px', borderRadius: '10px', border: `1px solid ${timerColor}44` }}>
            <Timer size={18} color={timerColor} />
            <span style={{ color: timerColor, fontFamily: 'monospace', fontSize: '1.3rem', fontWeight: 800, minWidth: '70px', textAlign: 'center' }}>
              {formatTime(timeLeft)}
            </span>
          </div>

          <div style={{ height: '32px', width: '1px', background: 'var(--border-color)' }} />

          <button onClick={toggleFullscreen} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-secondary)', padding: '8px' }}>
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>

          {!submitted && (
            <button onClick={handleFinish} disabled={finishing} style={{
              padding: '10px 20px', borderRadius: '8px', border: 'none',
              background: '#ef4444', color: 'white', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 700,
              boxShadow: '0 4px 6px -1px rgba(239, 68, 68, 0.4)'
            }}>
              FINISH TEST
            </button>
          )}

          <button onClick={() => { setTestStarted(false); setTimerRunning(false); }} style={{
            background: 'transparent', border: '1px solid var(--border-color)', padding: '8px 12px',
            borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem'
          }}>
            Exit
          </button>
        </div>
      </div>

      {/* MAIN WORKSPACE */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* LEFT NAV: Sidebar with Question Grid */}
        <div style={{
          width: '240px', flexShrink: 0, background: 'rgba(15,23,42,0.5)',
          borderRight: '1px solid var(--border-color)', padding: '24px 16px', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: '20px'
        }}>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', fontWeight: 700, marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Question Progress
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {questions.map((_, i) => {
                const s = qStates[i]?.status || 'unattempted';
                return (
                  <button
                    key={i}
                    onClick={() => setCurrentIdx(i)}
                    style={{
                      aspectRatio: '1', borderRadius: '10px', border: currentIdx === i ? '2px solid white' : '1px solid var(--border-color)',
                      background: currentIdx === i ? 'rgba(255,255,255,0.1)' : statusColors[s] + '15',
                      color: statusColors[s] === '#475569' ? 'white' : statusColors[s],
                      fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      transform: currentIdx === i ? 'scale(1.05)' : 'scale(1)'
                    }}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: 'auto', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', fontWeight: 700, marginBottom: '12px', textTransform: 'uppercase' }}>Legend</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { c: '#475569', l: 'Not Seen' },
                { c: '#3b82f6', l: 'Answered' },
                { c: '#f59e0b', l: 'Review' },
                { c: '#10b981', l: 'Graded' },
              ].map(({c, l}) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: c }} />
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{l}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CENTER BOX: The Question Editor */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '40px' }}>
          
          {submitted && (
            <div className="glass-panel animate-scale-in" style={{ padding: '32px', marginBottom: '40px', border: '2px solid #10b981', background: 'rgba(16,185,129,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ background: '#10b981', padding: '12px', borderRadius: '16px' }}>
                  <Trophy size={32} color="white" />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.8rem' }}>Submission Complete!</h2>
                  <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
                    You have successfully completed the practice session for <strong>{selTopic?.name}</strong>.
                  </p>
                </div>
                <button onClick={() => { setTestStarted(false); setTimerRunning(false); }} className="btn btn-primary" style={{ marginLeft: 'auto', background: '#10b981' }}>
                  <RotateCcw size={18} /> Practice Another
                </button>
              </div>
            </div>
          )}

          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            {/* Nav Row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--accent-primary)' }}>Q{currentIdx + 1}.</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Type: Multiple Choice / Subjective</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={() => updateQ(currentIdx, { status: currentQState?.status === 'reviewing' ? 'unattempted' : 'reviewing' })}
                  style={{
                    padding: '6px 14px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700,
                    background: currentQState?.status === 'reviewing' ? '#f59e0b' : 'transparent',
                    color: currentQState?.status === 'reviewing' ? 'white' : '#f59e0b',
                    border: '1px solid #f59e0b', cursor: 'pointer'
                  }}
                >
                  {currentQState?.status === 'reviewing' ? 'UNMARK' : 'MARK FOR REVIEW'}
                </button>
              </div>
            </div>

            {/* Question Card */}
            <div className="glass-panel" style={{ padding: '32px', marginBottom: '32px', border: '1px solid rgba(255,255,255,0.1)' }}>
              {currentQ?.years_appeared && currentQ.years_appeared.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                  {currentQ.years_appeared.map((year: string) => (
                    <span key={year} style={{ 
                      fontSize: '0.65rem', fontWeight: 900, color: 'var(--accent-secondary)', 
                      background: 'rgba(16,185,129,0.1)', padding: '4px 10px', 
                      borderRadius: '6px', border: '1px solid rgba(16,185,129,0.3)',
                      letterSpacing: '0.05em'
                    }}>
                      {year.toUpperCase()}
                    </span>
                  ))}
                </div>
              )}
              <div className="markdown-content" style={{ fontSize: '1.15rem', lineHeight: 1.7, overflowAnchor: 'none' }}>
                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {currentQ?.question || 'No content found.'}
                </ReactMarkdown>
              </div>
            </div>

            {/* Editor Area / Option Selection */}
            {!submitted && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {currentQ?.options && currentQ.options.length > 0 ? (
                  /* MCQ Options - Premium UI */
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '14px' }}>
                    {currentQ.options.map((opt: string, idx: number) => {
                      // Inference: If opt doesn't start with A), B), use index
                      const match = opt.match(/^\s*[\(]?([A-D])[\)\.]/i);
                      const letter = match ? match[1].toUpperCase() : String.fromCharCode(65 + idx);
                      const isSelected = currentQState?.userAnswer === letter;
                      
                      return (
                        <button
                          key={opt + idx}
                          onClick={() => updateQ(currentIdx, { userAnswer: letter })}
                          disabled={currentQState?.status === 'grading'}
                          className="mcq-option"
                          style={{
                            textAlign: 'left', padding: '16px 24px', borderRadius: '16px', cursor: 'pointer',
                            fontSize: '1.05rem', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
                            display: 'flex', alignItems: 'center', gap: '16px',
                            background: isSelected ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                            border: isSelected ? '2px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.1)',
                            color: isSelected ? 'white' : 'var(--text-secondary)',
                            boxShadow: isSelected ? '0 0 20px rgba(99, 102, 241, 0.2)' : 'none',
                            transform: isSelected ? 'translateX(8px)' : 'none'
                          }}
                        >
                          <div style={{
                            width: '32px', height: '32px', borderRadius: '10px', 
                            display: 'flex', alignItems: 'center', justifyContent: 'center', 
                            fontSize: '0.9rem', fontWeight: 900,
                            background: isSelected ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                            color: 'white',
                            boxShadow: isSelected ? '0 4px 10px rgba(99, 102, 241, 0.4)' : 'none',
                            transition: 'all 0.2s', flexShrink: 0
                          }}>
                            {letter}
                          </div>
                          <div className="markdown-content" style={{ flex: 1, fontWeight: isSelected ? 600 : 400 }}>
                            {/* Render option text with markdown/math support */}
                            <ReactMarkdown 
                              remarkPlugins={[remarkMath]} 
                              rehypePlugins={[rehypeKatex]}
                              components={{
                                p: ({node, ...props}) => <p {...props} style={{ margin: 0 }} />
                              }}
                            >
                              {match ? opt.replace(match[0], '').trim() : opt}
                            </ReactMarkdown>
                          </div>
                          {isSelected && <CheckCircle size={20} color="var(--accent-primary)" className="animate-scale-in" />}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ padding: '40px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
                    <Sparkles size={32} color="var(--accent-primary)" style={{ marginBottom: '12px', opacity: 0.5 }} />
                    <p style={{ color: 'var(--text-secondary)', margin: 0 }}>This question doesn't have multiple choice options.</p>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '6px' }}>Current Practice Lab mode is set to MCQ only.</p>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => {
                      updateQ(currentIdx, { status: 'answered' });
                      if (currentIdx < questions.length - 1) {
                        setCurrentIdx(prev => prev + 1);
                      }
                    }}
                    disabled={!currentQState?.userAnswer?.trim() || submitted}
                    className="btn btn-primary"
                    style={{ flex: 1, padding: '14px', borderRadius: '12px', fontWeight: 800, letterSpacing: '0.04em', background: 'var(--accent-primary)' }}
                  >
                    SAVE & NEXT
                  </button>
                  
                  {currentIdx === questions.length - 1 && !submitted && (
                    <button
                      onClick={handleFinish}
                      disabled={finishing}
                      className="btn"
                      style={{ 
                        flex: 1, padding: '14px', borderRadius: '12px', fontWeight: 800, 
                        background: 'rgba(34,197,94,0.2)', color: '#4ade80', border: '1px solid #4ade80' 
                      }}
                    >
                      {finishing ? 'FINISHING...' : 'FINISH TEST'}
                    </button>
                  )}

                  <button
                    onClick={() => setCurrentIdx(prev => Math.min(questions.length - 1, prev + 1))}
                    style={{
                      padding: '0 24px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)',
                      borderRadius: '12px', color: 'white', cursor: 'pointer', fontWeight: 700
                    }}
                  >
                    SKIP
                  </button>
                </div>
              </div>
            )}

            {/* Final Test Report Summary */}
            {submitted && testResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                <div className="glass-panel slide-up" style={{ padding: '30px', borderRadius: '20px', background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(168,85,247,0.1))', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Trophy size={32} color="#fbbf24" />
                        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900 }}>TEST COMPLETED</h2>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--accent-primary)' }}>{testResult.score} / {testResult.total}</div>
                        <div style={{ fontSize: '0.8rem', opacity: 0.6, fontWeight: 700, letterSpacing: '0.1em' }}>FINAL SCORE</div>
                    </div>
                  </div>
                  <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${(testResult.score / testResult.total) * 100}%`, height: '100%', background: 'var(--accent-primary)', boxShadow: '0 0 20px var(--accent-primary)' }} />
                  </div>
                  <p style={{ marginTop: '16px', color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center' }}>
                    Great effort! You've completed the practice session. Review each question in detail below.
                  </p>
                </div>

                {/* Detailed Analysis List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'white', opacity: 0.8 }}>
                      <FileText size={20} />
                      <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>DETAILED ANALYSIS</h3>
                   </div>

                   {testResult.results.map((res: any, idx: number) => (
                      <div key={res.question_id} className="glass-panel slide-up" style={{ 
                        padding: '28px', borderRadius: '20px', border: '1px solid ' + (res.is_correct ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'),
                        background: res.is_correct ? 'rgba(34,197,94,0.03)' : 'rgba(239,68,68,0.03)'
                      }}>
                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                               <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', padding: '4px 12px', borderRadius: '20px', alignSelf: 'flex-start' }}>
                                  QUESTION {idx + 1}
                               </span>
                               {res.years_appeared && res.years_appeared.length > 0 && (
                                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                     {res.years_appeared.map((year: string) => (
                                        <span key={year} style={{ fontSize: '0.6rem', fontWeight: 900, color: '#fbbf24', background: 'rgba(251,191,36,0.1)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(251,191,36,0.3)' }}>
                                           {year.toUpperCase()}
                                        </span>
                                     ))}
                                  </div>
                               )}
                            </div>
                            {res.is_correct ? (
                               <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#4ade80', fontSize: '0.85rem', fontWeight: 800 }}>
                                  <CheckCircle size={16} /> CORRECT
                               </div>
                            ) : (
                               <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f87171', fontSize: '0.85rem', fontWeight: 800 }}>
                                  <XCircle size={16} /> INCORRECT
                               </div>
                            )}
                         </div>

                         <div className="markdown-content" style={{ fontSize: '1.05rem', color: 'white', marginBottom: '24px', lineHeight: 1.6 }}>
                            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                               {res.question_text}
                            </ReactMarkdown>
                         </div>

                         {/* Options Review */}
                         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                            {res.options.map((opt: string) => {
                               const match = opt.match(/^([A-D])[:\)]/i);
                               const optLet = match ? match[1].toUpperCase() : '';
                               const isSelected = res.selected_option === optLet;
                               const isCorrect = res.correct_option === optLet;
                               
                               let borderColor = 'rgba(255,255,255,0.1)';
                               let bg = 'rgba(255,255,255,0.02)';
                               
                               if (isCorrect) {
                                  borderColor = '#10b981';
                                  bg = 'rgba(16,185,129,0.1)';
                               } else if (isSelected && !isCorrect) {
                                  borderColor = '#ef4444';
                                  bg = 'rgba(239,68,68,0.1)';
                               }

                               return (
                                  <div key={opt} style={{ 
                                    padding: '12px 16px', borderRadius: '12px', border: '1px solid ' + borderColor, 
                                    background: bg, display: 'flex', alignItems: 'center', gap: '12px'
                                  }}>
                                     <div style={{ 
                                       width: '28px', height: '28px', borderRadius: '50%', display: 'flex', 
                                       alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.85rem',
                                       background: isCorrect ? '#10b981' : isSelected ? '#ef4444' : 'rgba(255,255,255,0.1)',
                                       color: 'white'
                                     }}>
                                        {optLet || '?'}
                                     </div>
                                     <div style={{ flex: 1, fontSize: '0.9rem', color: isCorrect || isSelected ? 'white' : 'var(--text-secondary)' }}>
                                        <ReactMarkdown 
                                          remarkPlugins={[remarkMath]} 
                                          rehypePlugins={[rehypeKatex]}
                                          components={{ p: ({node, ...props}) => <p {...props} style={{ margin: 0 }} /> }}
                                        >
                                          {match ? opt.replace(match[0], '').trim() : opt}
                                        </ReactMarkdown>
                                     </div>
                                  </div>
                               );
                            })}
                         </div>

                         {/* Solution Breakdown */}
                         {res.solution_text && (
                            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '20px' }}>
                               <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', color: 'var(--accent-primary)' }}>
                                  <BookOpen size={18} />
                                  <span style={{ fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.05em' }}>SOLUTION & EXPLANATION</span>
                               </div>
                               <div className="markdown-content" style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.95rem' }}>
                                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                     {res.solution_text}
                                  </ReactMarkdown>
                               </div>
                            </div>
                         )}
                      </div>
                   ))}
                </div>
              </div>
            )}

            {/* Feedback & Solution - Revealed after submission */}
            {currentQState?.feedback && submitted && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '24px' }}>
                <div style={{ 
                  padding: '20px', borderRadius: '12px', 
                  background: currentQState.status === 'correct' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', 
                  border: currentQState.status === 'correct' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)',
                  display: 'flex', gap: '16px', alignItems: 'flex-start'
                }}>
                  {currentQState.status === 'correct' ? <CheckCircle size={24} color="#4ade80" /> : <XCircle size={24} color="#f87171" />}
                  <p style={{ margin: 0, color: currentQState.status === 'correct' ? '#86efac' : '#fca5a5', fontSize: '0.95rem', lineHeight: 1.5, fontWeight: 600 }}>
                    {currentQState.feedback}
                  </p>
                </div>

                {currentQState.solution && (
                  <div className="glass-panel slide-up" style={{ padding: '24px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', color: 'var(--accent-primary)' }}>
                      <BookOpen size={20} />
                      <span style={{ fontWeight: 800, fontSize: '0.9rem', letterSpacing: '0.05em' }}>STEP-BY-STEP SOLUTION</span>
                    </div>
                    <div className="markdown-content" style={{ color: 'var(--text-secondary)', lineHeight: 1.8, fontSize: '1rem' }}>
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {currentQState.solution}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* FOOTER BAR */}
      <div style={{
        height: '48px', flexShrink: 0, background: '#1e293b', borderTop: '1px solid var(--border-color)',
        display: 'flex', alignItems: 'center', padding: '0 24px', justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', gap: '20px', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600 }}>
          <span>CURRICULUM: {selSubject?.name}</span>
          <span>COLLECTION: NEET_PYQ_VECTOR</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            disabled={currentIdx === 0}
            onClick={() => setCurrentIdx(i => i - 1)}
            style={{ background: 'none', border: 'none', color: currentIdx === 0 ? '#475569' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ChevronLeft size={16} /> Previous
          </button>
          <div style={{ width: '1px', height: '16px', background: '#334155' }} />
          <button 
            disabled={currentIdx === questions.length - 1}
            onClick={() => setCurrentIdx(i => i + 1)}
            style={{ background: 'none', border: 'none', color: currentIdx === questions.length - 1 ? '#475569' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            Next <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <style>{`
        textarea:focus { border-color: var(--accent-primary) !important; }
        .glass-panel { transition: transform 0.2s; }
        .btn:active { transform: scale(0.98); }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slide-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .slide-up { animation: slide-up 0.4s ease-out forwards; }
        .glass-panel { backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
        .markdown-content p { margin: 0.8em 0; }
        .markdown-content ul, .markdown-content ol { padding-left: 1.5em; margin: 0.8em 0; }
        .markdown-content li { margin: 0.4em 0; }
        .markdown-content strong { color: white; }
        .mcq-option:hover { transform: translateX(8px); background: rgba(255,255,255,0.08) !important; border-color: rgba(255,255,255,0.2) !important; }
        .animate-scale-in { animation: scale-in 0.2s ease-out; }
        @keyframes scale-in { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        html, body { scroll-behavior: auto !important; } /* Prevent smooth scroll jumps */
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>
    </div>
  );
}
