import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import {
  Target, Clock, AlertTriangle, BookOpen, CheckCircle2,
  RotateCcw, Trash2, Brain, X as XIcon, Trophy, TrendingDown,
  TrendingUp, BarChart2, Zap, ChevronRight
} from 'lucide-react';
import TestAnalyticsSection from '../components/TestAnalyticsSection';
import ChapterAnalysisModal from '../components/ChapterAnalysisModal';

const API_URL = 'http://127.0.0.1:8002/api/v1';
const MOCK_USER = 'user_123';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#84cc16', '#ec4899'];
const DOUBT_TYPE_COLORS: Record<string, string> = {
  conceptual: '#8b5cf6', calculation: '#f59e0b', misconception: '#ef4444', other: '#64748b',
};

const SUBJECT_COLORS: Record<string, string> = {
  physics: '#6366f1', chemistry: '#10b981', botany: '#84cc16', zoology: '#f59e0b',
};

interface Doubt {
  id: string; subtopic_id: string; subtopic_name: string;
  topic_id: string | null; topic_name: string | null;
  doubt_type: string; description: string; status: string;
  occurrence_count: number; created_at: string;
}

interface ChapterInfo {
  chapter: string; chapter_name: string; subject: string;
  has_test_data: boolean; has_learning_data: boolean; topic_id?: string;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats]       = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [doubts, setDoubts]     = useState<Doubt[]>([]);
  const [showResolved, setShowResolved]   = useState(false);
  const [topicMetrics, setTopicMetrics]   = useState<any[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<any | null>(null);
  const [chapters, setChapters]           = useState<ChapterInfo[]>([]);
  const [chapterAnalysis, setChapterAnalysis] = useState<ChapterInfo | null>(null);

  useEffect(() => {
    Promise.all([
      axios.get(`${API_URL}/dashboard/${MOCK_USER}/stats`),
      axios.get(`${API_URL}/dashboard/${MOCK_USER}/topic-metrics`),
      axios.get(`${API_URL}/dashboard/${MOCK_USER}/chapters`),
    ]).then(([statsRes, metricsRes, chaptersRes]) => {
      setStats(statsRes.data);
      setTopicMetrics(metricsRes.data.topics || []);
      setChapters(chaptersRes.data.chapters || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const fetchDoubts = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/doubts/${MOCK_USER}`, {
        params: { status: showResolved ? 'resolved' : 'active' }
      });
      setDoubts(res.data.doubts || []);
    } catch {}
  }, [showResolved]);
  useEffect(() => { fetchDoubts(); }, [fetchDoubts]);

  const resolveDoubt   = async (id: string) => { await axios.patch(`${API_URL}/doubts/${id}/resolve`); fetchDoubts(); };
  const unresolveDoubt = async (id: string) => { await axios.patch(`${API_URL}/doubts/${id}/unresolve`); fetchDoubts(); };
  const deleteDoubt    = async (id: string) => { await axios.delete(`${API_URL}/doubts/${id}`); fetchDoubts(); };

  const studyDoubt = (doubt: Doubt) => {
    const existing = JSON.parse(localStorage.getItem('learning_selections') || '{}');
    localStorage.setItem('learning_selections', JSON.stringify({
      ...existing, targetSubtopicId: doubt.subtopic_id, targetSubtopicName: doubt.subtopic_name,
    }));
    const doubtParam = doubt.description ? `?doubtCtx=${encodeURIComponent(doubt.description)}` : '';
    navigate(`/learning/${doubt.topic_id}${doubtParam}`);
  };

  if (loading) return <div className="animate-fade-in"><h1 className="page-title">Loading Analytics...</h1></div>;

  // ── Derived data ──────────────────────────────────────────────────────────
  const mistakeEntries = Object.entries(stats?.mistake_distribution || {});
  const progressCounts = stats?.progress_summary || {};
  const totalSubtopics = Object.values(progressCounts).reduce((a: number, b) => a + (b as number), 0) as number;

  // Progress distribution for pie (if no mistake data)
  const progressPieData = [
    { name: 'Mastered', value: progressCounts.completed || 0, color: '#10b981' },
    { name: 'In Progress', value: progressCounts.in_progress || 0, color: '#6366f1' },
    { name: 'Not Started', value: (totalSubtopics - (progressCounts.completed || 0) - (progressCounts.in_progress || 0)), color: '#334155' },
  ].filter(d => d.value > 0);

  const mistakePieData = mistakeEntries.map(([name, value], i) => ({
    name, value: value as number, color: COLORS[i % COLORS.length],
  }));

  const progressData = topicMetrics.map(t => ({
    name: t.topic_name.length > 18 ? t.topic_name.slice(0, 16) + '…' : t.topic_name,
    fullName: t.topic_name, completion: t.completion_percentage, raw: t,
  }));

  return (
    <div className="animate-fade-in">
      <h1 className="page-title">Performance Analytics</h1>

      {/* ─── Summary Cards ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        {[
          { label: 'Total Study Time', val: `${stats?.total_time_spent_minutes || 0} min`, icon: Clock, color: '#6366f1' },
          { label: 'Subtopics Mastered', val: progressCounts.completed || 0, icon: Trophy, color: '#10b981' },
          { label: 'In Progress', val: progressCounts.in_progress || 0, icon: TrendingUp, color: '#f59e0b' },
          { label: 'Active Doubts', val: doubts.filter(d => d.status === 'active').length, icon: Brain, color: '#8b5cf6' },
        ].map(s => (
          <div key={s.label} className="glass-panel" style={{ padding: '18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: `${s.color}20`, padding: '10px', borderRadius: '10px', color: s.color, flexShrink: 0 }}>
              <s.icon size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{s.label}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: s.color }}>{s.val}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Learning Charts (2-col) ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>

        {/* Error Breakdown — always shows something */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>
              {mistakePieData.length > 0 ? 'Error Breakdown' : 'Study Progress'}
            </h2>
            {mistakePieData.length === 0 && (
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '20px' }}>
                No mistakes logged yet
              </span>
            )}
          </div>

          {mistakePieData.length > 0 ? (
            // Show mistake type breakdown
            <div style={{ height: '220px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={mistakePieData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={4} dataKey="value" label>
                    {mistakePieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.8rem' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : totalSubtopics > 0 ? (
            // Show progress distribution when no mistakes
            <>
              <div style={{ height: '140px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={progressPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                      {progressPieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.8rem' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '8px' }}>
                {progressPieData.map(p => (
                  <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.color }} />
                    <span style={{ color: 'var(--text-secondary)' }}>{p.name}: </span>
                    <span style={{ color: p.color, fontWeight: 700 }}>{p.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            // Completely empty state — show call to action
            <div style={{ height: '200px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
              <Brain size={36} color="var(--text-secondary)" style={{ opacity: 0.4 }} />
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center' }}>
                Start studying or take a test to<br/>see your performance breakdown
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => navigate('/learning')} style={{ padding: '6px 14px', borderRadius: '8px', background: 'var(--accent-primary)', border: 'none', color: 'white', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>
                  Start Studying
                </button>
                <button onClick={() => navigate('/test')} style={{ padding: '6px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.07)', border: '1px solid var(--border-color)', color: 'white', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>
                  Take a Test
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Topic Progress */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h2 style={{ margin: '0 0 14px', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            Topic Progress
            <span style={{ fontSize: '0.68rem', fontWeight: 400, color: 'var(--text-secondary)' }}>click bar → subtopics</span>
          </h2>
          {progressData.length > 0 ? (
            <div style={{ height: '220px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={progressData} onClick={(d: any) => {
                  if (d?.activePayload?.[0]) setSelectedTopic(d.activePayload[0].payload.raw);
                }} style={{ cursor: 'pointer' }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" stroke="var(--text-secondary)" tick={{ fontSize: 10 }} />
                  <YAxis stroke="var(--text-secondary)" domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.78rem' }}
                    formatter={(v: any) => [`${v}%`, 'Completion']}
                    labelFormatter={(_: any, payload: any) => payload?.[0]?.payload?.fullName || ''}
                  />
                  <Bar dataKey="completion" radius={[4, 4, 0, 0]}>
                    {progressData.map((_e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ height: '220px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <BarChart2 size={32} color="var(--text-secondary)" style={{ opacity: 0.4, marginBottom: '10px' }} />
              <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.85rem' }}>No progress recorded yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── Strong Topics (from learning + test combined) ─── */}
      {topicMetrics.some(t => t.completion_percentage >= 60) && (
        <div className="glass-panel" style={{ padding: '18px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <Trophy size={16} color="#f59e0b" />
            <h2 style={{ margin: 0, fontSize: '0.95rem' }}>Strong Topics</h2>
            <span style={{ fontSize: '0.68rem', color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '2px 8px', borderRadius: '20px', fontWeight: 600 }}>≥60% mastery</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {topicMetrics.filter(t => t.completion_percentage >= 60).map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 12px', borderRadius: '20px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', cursor: 'pointer' }}
                onClick={() => setSelectedTopic(t)}>
                <CheckCircle2 size={12} color="#10b981" />
                <span style={{ fontSize: '0.78rem', color: '#d1fae5', fontWeight: 600 }}>{t.topic_name}</span>
                <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 700 }}>{t.completion_percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Chapter-Wise Analysis ─── */}
      <div className="glass-panel" style={{ padding: '18px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BookOpen size={16} color="var(--accent-primary)" />
            <h2 style={{ margin: 0, fontSize: '0.95rem' }}>Chapter-Wise Analysis</h2>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>click any chapter for deep insights</span>
          </div>
        </div>
        {chapters.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Study chapters or take tests to see chapter-wise breakdown here.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {chapters.map((ch, i) => {
              const subjColor = SUBJECT_COLORS[ch.subject?.toLowerCase()] || '#6366f1';
              return (
                <button key={i} onClick={() => setChapterAnalysis(ch)} style={{
                  padding: '8px 14px', borderRadius: '10px', border: `1px solid ${subjColor}30`,
                  background: `${subjColor}10`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                  transition: 'all 0.15s',
                }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: subjColor, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.78rem', color: 'white', fontWeight: 600 }}>{ch.chapter_name}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {ch.has_test_data && <BarChart2 size={10} color={subjColor} />}
                    {ch.has_learning_data && <Brain size={10} color={subjColor} />}
                  </div>
                  <ChevronRight size={12} color="var(--text-secondary)" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── TEST PERFORMANCE ANALYTICS ─── */}
      <div style={{ marginBottom: '24px' }}>
        <TestAnalyticsSection userId={MOCK_USER} />
      </div>

      {/* ─── Doubt Tracker ─── */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            <Brain size={18} color="#8b5cf6" />
            <h2 style={{ margin: 0, fontSize: '0.95rem' }}>Weak Topics & Doubts</h2>
            <span style={{ fontSize: '0.68rem', background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', padding: '2px 8px', borderRadius: '20px', fontWeight: 600 }}>AI Detected</span>
          </div>
          <button onClick={() => setShowResolved(r => !r)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 10px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.75rem' }}>
            {showResolved ? 'Show Active' : 'Show Resolved'}
          </button>
        </div>

        {doubts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
            <CheckCircle2 size={32} style={{ marginBottom: '8px', color: '#10b981', opacity: 0.6 }} />
            <p style={{ margin: 0 }}>{showResolved ? 'No resolved doubts yet.' : 'No active doubts! Keep chatting with your tutor.'}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
            {doubts.map(doubt => (
              <div key={doubt.id} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '9px', border: '1px solid rgba(255,255,255,0.07)', padding: '12px 16px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '4px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 7px', borderRadius: '20px', background: `${DOUBT_TYPE_COLORS[doubt.doubt_type] || '#64748b'}22`, color: DOUBT_TYPE_COLORS[doubt.doubt_type] || '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {doubt.doubt_type}
                    </span>
                    <span style={{ fontWeight: 600, color: 'white', fontSize: '0.88rem' }}>{doubt.subtopic_name}</span>
                    {doubt.topic_name && <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>in {doubt.topic_name}</span>}
                    {doubt.occurrence_count > 1 && <span style={{ fontSize: '0.65rem', background: 'rgba(239,68,68,0.15)', color: '#f87171', padding: '1px 5px', borderRadius: '8px' }}>×{doubt.occurrence_count}</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{doubt.description}</p>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  {!showResolved && (
                    <button onClick={() => studyDoubt(doubt)} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: '6px', padding: '4px 9px', color: 'white', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
                      <BookOpen size={11} /> Study
                    </button>
                  )}
                  {showResolved ? (
                    <button onClick={() => unresolveDoubt(doubt.id)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '4px 8px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      <RotateCcw size={12} />
                    </button>
                  ) : (
                    <button onClick={() => resolveDoubt(doubt.id)} style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '6px', padding: '4px 8px', color: '#10b981', cursor: 'pointer' }}>
                      <CheckCircle2 size={12} />
                    </button>
                  )}
                  <button onClick={() => deleteDoubt(doubt.id)} style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '4px 8px', color: '#f87171', cursor: 'pointer' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Topic Drilldown Modal ─── */}
      {selectedTopic && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel animate-fade-in" style={{ width: '90%', maxWidth: '560px', maxHeight: '80vh', overflowY: 'auto', padding: '26px', position: 'relative' }}>
            <button onClick={() => setSelectedTopic(null)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>
              <XIcon size={20} />
            </button>
            <h2 style={{ fontSize: '1.3rem', marginBottom: '6px' }}>{selectedTopic.topic_name}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <div style={{ height: '5px', background: 'rgba(255,255,255,0.1)', flex: 1, borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${selectedTopic.completion_percentage}%`, background: 'var(--accent-success)' }} />
              </div>
              <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{selectedTopic.completion_percentage}% Complete</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
              {selectedTopic.subtopics.map((sub: any) => (
                <div key={sub.subtopic_id} style={{ background: 'rgba(255,255,255,0.03)', padding: '13px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4 style={{ margin: '0 0 5px', fontSize: '0.9rem' }}>{sub.subtopic_name}</h4>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <div style={{ height: '4px', flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${sub.confidence}%`, background: sub.confidence >= 65 ? '#10b981' : sub.confidence > 0 ? '#6366f1' : '#475569', borderRadius: '4px' }} />
                      </div>
                      <span style={{ fontSize: '0.72rem', color: sub.confidence >= 65 ? '#10b981' : (sub.confidence > 0 ? '#6366f1' : 'var(--text-secondary)'), fontWeight: 700, minWidth: '30px' }}>
                        {sub.confidence === 0 ? 'New' : `${sub.confidence}%`}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => {
                    const doubt: Doubt = { id: '', subtopic_id: sub.subtopic_id, subtopic_name: sub.subtopic_name, topic_id: selectedTopic.topic_id, topic_name: selectedTopic.topic_name, doubt_type: '', description: '', status: '', occurrence_count: 0, created_at: '' };
                    studyDoubt(doubt);
                  }} style={{ marginLeft: '12px', background: 'rgba(255,255,255,0.08)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                    <BookOpen size={12} /> Study
                  </button>
                </div>
              ))}
              {selectedTopic.subtopics.length === 0 && <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '18px' }}>No subtopics found.</p>}
            </div>
          </div>
        </div>
      )}

      {/* ─── Chapter Analysis Modal ─── */}
      {chapterAnalysis && (
        <ChapterAnalysisModal
          chapter={chapterAnalysis.chapter}
          chapterName={chapterAnalysis.chapter_name}
          subject={chapterAnalysis.subject}
          userId={MOCK_USER}
          onClose={() => setChapterAnalysis(null)}
          onStartTest={(ch, subj) => {
            setChapterAnalysis(null);
            navigate('/test', { state: { prefill: { type: 'chapter_mock', chapter: ch, subject: subj } } });
          }}
        />
      )}
    </div>
  );
}
