import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { Target, Clock, AlertTriangle, BookOpen, CheckCircle2, RotateCcw, Trash2, Brain, X as XIcon } from 'lucide-react';

const API_URL = 'http://127.0.0.1:8002/api/v1';
const MOCK_USER = 'user_123';


const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];

const DOUBT_TYPE_COLORS: Record<string, string> = {
  conceptual:    '#8b5cf6',
  calculation:   '#f59e0b',
  misconception: '#ef4444',
  other:         '#64748b',
};

interface Doubt {
  id: string;
  subtopic_id: string;
  subtopic_name: string;
  topic_id: string | null;
  topic_name: string | null;
  doubt_type: string;
  description: string;
  status: string;
  occurrence_count: number;
  created_at: string;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats]     = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [doubts, setDoubts]   = useState<Doubt[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const [topicMetrics, setTopicMetrics] = useState<any[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<any | null>(null);

  // Fetch stats and metrics
  useEffect(() => {
    Promise.all([
      axios.get(`${API_URL}/dashboard/${MOCK_USER}/stats`),
      axios.get(`${API_URL}/dashboard/${MOCK_USER}/topic-metrics`)
    ]).then(([statsRes, metricsRes]) => {
      setStats(statsRes.data);
      setTopicMetrics(metricsRes.data.topics || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);


  // Fetch doubts
  const fetchDoubts = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/doubts/${MOCK_USER}`, {
        params: { status: showResolved ? 'resolved' : 'active' }
      });
      setDoubts(res.data.doubts || []);
    } catch {}
  }, [showResolved]);

  useEffect(() => { fetchDoubts(); }, [fetchDoubts]);

  const resolveDoubt = async (id: string) => {
    await axios.patch(`${API_URL}/doubts/${id}/resolve`);
    fetchDoubts();
  };

  const unresolveDoubt = async (id: string) => {
    await axios.patch(`${API_URL}/doubts/${id}/unresolve`);
    fetchDoubts();
  };

  const deleteDoubt = async (id: string) => {
    await axios.delete(`${API_URL}/doubts/${id}`);
    fetchDoubts();
  };

  const studyDoubt = (doubt: Doubt) => {
    // Save the topic/subtopic context to localStorage so LearningPage pre-selects it
    const existing = JSON.parse(localStorage.getItem('learning_selections') || '{}');
    localStorage.setItem('learning_selections', JSON.stringify({
      ...existing,
      targetSubtopicId: doubt.subtopic_id,
      targetSubtopicName: doubt.subtopic_name,
    }));
    
    // Navigate to separated study interface with optional doubt context query
    const doubtParam = doubt.description ? `?doubtCtx=${encodeURIComponent(doubt.description)}` : '';
    navigate(`/learning/${doubt.topic_id}${doubtParam}`);
  };

  if (loading) return <div className="animate-fade-in"><h1 className="page-title">Loading Analytics...</h1></div>;

  const mistakeData  = stats ? Object.entries(stats.mistake_distribution).map(([name, value]) => ({ name, value })) : [];
  const progressData = topicMetrics.map(t => ({ name: t.topic_name, completion: t.completion_percentage, raw: t }));


  return (
    <div className="animate-fade-in">
      <h1 className="page-title">Performance Analytics</h1>

      {/* Top Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ background: 'rgba(59, 130, 246, 0.2)', padding: '12px', borderRadius: '50%', color: 'var(--accent-primary)' }}>
            <Clock size={28} />
          </div>
          <div>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Total Study Time</h3>
            <p style={{ fontSize: '1.8rem', fontWeight: 700 }}>{stats?.total_time_spent_minutes || 0} min</p>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.2)', padding: '12px', borderRadius: '50%', color: 'var(--accent-success)' }}>
            <Target size={28} />
          </div>
          <div>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Completed Topics</h3>
            <p style={{ fontSize: '1.8rem', fontWeight: 700 }}>{stats?.progress_summary?.completed || 0}</p>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ background: 'rgba(239, 68, 68, 0.2)', padding: '12px', borderRadius: '50%', color: 'var(--accent-danger)' }}>
            <AlertTriangle size={28} />
          </div>
          <div>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Mistakes Logged</h3>
            <p style={{ fontSize: '1.8rem', fontWeight: 700 }}>
              {mistakeData.reduce((acc, item) => acc + (item.value as number), 0)}
            </p>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ background: 'rgba(139, 92, 246, 0.2)', padding: '12px', borderRadius: '50%', color: '#8b5cf6' }}>
            <Brain size={28} />
          </div>
          <div>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Active Doubts</h3>
            <p style={{ fontSize: '1.8rem', fontWeight: 700 }}>{doubts.filter(d => d.status === 'active').length}</p>
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginBottom: '30px' }}>
        {/* Mistake Distribution Chart */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h2 style={{ marginBottom: '20px', fontSize: '1.2rem' }}>Error Breakdown</h2>
          {mistakeData.length > 0 ? (
            <div style={{ height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={mistakeData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value" label>
                    {mistakeData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p style={{ color: 'var(--text-secondary)' }}>No mistakes logged yet. Great job!</p>
          )}
        </div>

        {/* Progress Summary Chart */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h2 style={{ marginBottom: '20px', fontSize: '1.2rem' }}>Topic Status <span style={{fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--text-secondary)'}}>(Click bar to see subtopics)</span></h2>
          {progressData.length > 0 ? (
            <div style={{ height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={progressData} onClick={(data: any) => {
                  if (data && data.activePayload && data.activePayload.length > 0) {
                    setSelectedTopic(data.activePayload[0].payload.raw);
                  }
                }} style={{ cursor: 'pointer' }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="name" stroke="var(--text-secondary)" tick={{fontSize: 12}} />
                  <YAxis stroke="var(--text-secondary)" domain={[0, 100]} />
                  <Tooltip contentStyle={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '8px' }} formatter={(val) => [`${val}%`, 'Completion']} />
                  <Bar dataKey="completion" fill="var(--accent-secondary)" radius={[4, 4, 0, 0]}>
                    {progressData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p style={{ color: 'var(--text-secondary)' }}>No progress recorded. Start learning!</p>
          )}
        </div>
      </div>


      {/* ─── Weak Topics / Doubt Tracker ─── */}
      <div className="glass-panel" style={{ padding: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Brain size={22} color="#8b5cf6" />
            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Weak Topics</h2>
            <span style={{ fontSize: '0.72rem', background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', padding: '2px 8px', borderRadius: '20px', fontWeight: 600 }}>
              AI Detected
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setShowResolved(r => !r)}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px 14px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem' }}
            >
              {showResolved ? 'Show Active' : 'Show Resolved'}
            </button>
          </div>
        </div>

        {doubts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
            <CheckCircle2 size={40} style={{ marginBottom: '12px', color: '#10b981', opacity: 0.6 }} />
            <p style={{ margin: 0, fontSize: '1rem' }}>
              {showResolved ? 'No resolved doubts yet.' : '🎉 No active doubts! Keep chatting with your tutor.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {doubts.map(doubt => (
              <div key={doubt.id} style={{
                background: 'rgba(255,255,255,0.03)', borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.08)', padding: '16px 20px',
                display: 'flex', gap: '16px', alignItems: 'flex-start',
                transition: 'all 0.2s',
              }}>
                {/* Badge row */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                      background: `${DOUBT_TYPE_COLORS[doubt.doubt_type] || '#64748b'}22`,
                      color: DOUBT_TYPE_COLORS[doubt.doubt_type] || '#64748b',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>
                      {doubt.doubt_type}
                    </span>
                    <span style={{ fontWeight: 600, color: 'white', fontSize: '0.95rem' }}>{doubt.subtopic_name}</span>
                    {doubt.topic_name && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>in {doubt.topic_name}</span>
                    )}
                    {doubt.occurrence_count > 1 && (
                      <span style={{ fontSize: '0.7rem', background: 'rgba(239,68,68,0.15)', color: '#f87171', padding: '1px 6px', borderRadius: '10px' }}>
                        ×{doubt.occurrence_count}
                      </span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {doubt.description}
                  </p>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  {!showResolved && (
                    <button
                      onClick={() => studyDoubt(doubt)}
                      title="Go study this topic"
                      style={{
                        display: 'flex', alignItems: 'center', gap: '5px',
                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none',
                        borderRadius: '6px', padding: '6px 12px', color: 'white',
                        fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <BookOpen size={13} /> Study Again
                    </button>
                  )}
                  {showResolved ? (
                    <button
                      onClick={() => unresolveDoubt(doubt.id)}
                      title="Mark as active again"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '6px 10px', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    >
                      <RotateCcw size={14} />
                    </button>
                  ) : (
                    <button
                      onClick={() => resolveDoubt(doubt.id)}
                      title="Mark as resolved"
                      style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '6px', padding: '6px 10px', color: '#10b981', cursor: 'pointer' }}
                    >
                      <CheckCircle2 size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => deleteDoubt(doubt.id)}
                    title="Remove from list"
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '6px 10px', color: '#f87171', cursor: 'pointer' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Topic Drilldown Modal ─── */}
      {selectedTopic && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="glass-panel animate-fade-in" style={{
            width: '90%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto',
            padding: '30px', position: 'relative'
          }}>
            <button
              onClick={() => setSelectedTopic(null)}
              style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}
            >
              <XIcon size={24} />
            </button>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>{selectedTopic.topic_name}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
              <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', flex: 1, borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${selectedTopic.completion_percentage}%`, background: 'var(--accent-success)' }} />
              </div>
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{selectedTopic.completion_percentage}% Complete</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {selectedTopic.subtopics.map((sub: any) => (
                <div key={sub.subtopic_id} style={{
                  background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  border: '1px solid rgba(255,255,255,0.05)'
                }}>
                  <div>
                    <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem' }}>{sub.subtopic_name}</h4>
                    <span style={{ fontSize: '0.8rem', color: sub.confidence >= 60 ? '#10b981' : (sub.confidence > 0 ? '#6366f1' : 'var(--text-secondary)') }}>
                      {sub.confidence === 0 ? 'Not Started' : `${sub.confidence}% Mastery`}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      // Navigate directly to learning page for this subtopic
                      const doubt: Doubt = {
                        id: '', subtopic_id: sub.subtopic_id, subtopic_name: sub.subtopic_name,
                        topic_id: selectedTopic.topic_id, topic_name: selectedTopic.topic_name,
                        doubt_type: '', description: '', status: '', occurrence_count: 0, created_at: ''
                      };
                      studyDoubt(doubt); // reuse function ignoring doubtCtx
                    }}
                    style={{
                      background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none',
                      padding: '8px 16px', borderRadius: '6px', fontSize: '0.85rem',
                      fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                    }}
                  >
                    <BookOpen size={14} /> Study
                  </button>
                </div>
              ))}
              {selectedTopic.subtopics.length === 0 && (
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>No subtopics found.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
