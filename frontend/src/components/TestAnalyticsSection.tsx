/**
 * TestAnalyticsSection — renders test-derived insights in the dashboard:
 *   - Test history cards (last 10 attempts)
 *   - Learning curve (score% over time)
 *   - Global weak / strong topics aggregated across all tests
 *   - Per-subject accuracy trend
 *   - Mistake type distribution from tests
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, BarChart, Bar, Cell, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from 'recharts';
import {
  Trophy, TrendingUp, TrendingDown, Brain, Zap, Target,
  BookOpen, ChevronRight, AlertTriangle, CheckCircle2, Clock,
  BarChart2, Layers
} from 'lucide-react';

const API = 'http://127.0.0.1:8002/api/v1';

const SUBJECT_COLORS: Record<string, string> = {
  physics: '#6366f1', chemistry: '#10b981', botany: '#84cc16', zoology: '#f59e0b'
};

interface TestReport {
  id: string; session_id: string; test_type: string; score: number; max_score: number;
  accuracy_pct: number; correct: number; wrong: number; skipped: number;
  subject_breakdown: Record<string, any>; weak_topics: any[]; strong_topics: any[];
  mistake_analysis: any; ai_feedback: string | null; ai_analysis_status: string;
  created_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  topic_quiz: 'Topic Quiz', chapter_mock: 'Chapter Mock',
  full_mock: 'Full Mock', practice_drill: 'Practice',
};
const TYPE_COLORS: Record<string, string> = {
  topic_quiz: '#6366f1', chapter_mock: '#10b981', full_mock: '#f59e0b', practice_drill: '#ec4899',
};

function ScoreBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(0, value) / max * 100 : 0;
  return (
    <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '4px', transition: 'width 0.8s ease' }} />
    </div>
  );
}

export default function TestAnalyticsSection({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [reports, setReports] = useState<TestReport[]>([]);
  const [weakTopics, setWeakTopics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [activeSubjectTab, setActiveSubjectTab] = useState<string>('all');

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/test/user/${userId}/history`),
      axios.get(`${API}/test/user/${userId}/weak-topics`),
    ]).then(([histRes, weakRes]) => {
      setReports(histRes.data.reports || []);
      setWeakTopics(weakRes.data.weak_topics || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [userId]);

  if (loading) return (
    <div style={{ padding: '32px', color: 'var(--text-secondary)', textAlign: 'center' }}>
      Loading test analytics...
    </div>
  );

  if (reports.length === 0) return (
    <div className="glass-panel" style={{ padding: '32px', textAlign: 'center' }}>
      <BarChart2 size={36} color="var(--text-secondary)" style={{ marginBottom: '12px' }} />
      <h3 style={{ color: 'white', marginBottom: '8px' }}>No tests taken yet</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '16px' }}>
        Take a test to see your performance insights here.
      </p>
      <button
        onClick={() => navigate('/test')}
        style={{ background: 'var(--accent-primary)', border: 'none', color: 'white', padding: '10px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
      >
        Go to Test Center
      </button>
    </div>
  );

  // ── Derived data ──────────────────────────────────────────────────────────

  // Learning curve: accuracy% over time
  const learningCurveData = [...reports].reverse().map((r, i) => ({
    attempt: `#${i + 1}`,
    accuracy: r.accuracy_pct,
    score: r.score,
    type: TYPE_LABELS[r.test_type] || r.test_type,
    date: new Date(r.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
  }));

  // Mistake type aggregation
  const mistakeCounts = { conceptual: 0, calculation: 0, speed: 0 };
  reports.forEach(r => {
    if (r.mistake_analysis) {
      mistakeCounts.conceptual += (r.mistake_analysis.conceptual || []).length;
      mistakeCounts.calculation += (r.mistake_analysis.calculation || []).length;
      mistakeCounts.speed += (r.mistake_analysis.speed || []).length;
    }
  });
  const mistakeData = [
    { name: 'Conceptual', value: mistakeCounts.conceptual, color: '#ef4444' },
    { name: 'Calculation', value: mistakeCounts.calculation, color: '#f59e0b' },
    { name: 'Speed', value: mistakeCounts.speed, color: '#6366f1' },
  ].filter(m => m.value > 0);

  // Subject accuracy radar from latest full test
  const latestFull = reports.find(r => r.test_type === 'full_mock' || Object.keys(r.subject_breakdown || {}).length >= 3);
  const radarData = latestFull ? Object.entries(latestFull.subject_breakdown || {}).map(([sub, s]) => ({
    subject: sub.charAt(0).toUpperCase() + sub.slice(1),
    accuracy: s.correct + s.wrong > 0 ? Math.round((s.correct / (s.correct + s.wrong)) * 100) : 0,
  })) : [];

  // Stats
  const avgAcc = reports.length > 0 ? Math.round(reports.reduce((s, r) => s + r.accuracy_pct, 0) / reports.length) : 0;
  const bestAcc = reports.length > 0 ? Math.round(Math.max(...reports.map(r => r.accuracy_pct))) : 0;
  const totalCorrect = reports.reduce((s, r) => s + r.correct, 0);
  const totalAttempted = reports.reduce((s, r) => s + r.correct + r.wrong, 0);

  // Filter weak topics by subject
  const filteredWeak = activeSubjectTab === 'all'
    ? weakTopics
    : weakTopics.filter(w => w.subject?.toLowerCase() === activeSubjectTab);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <BarChart2 size={22} color="var(--accent-primary)" />
          <h2 style={{ margin: 0, fontSize: '1.15rem', color: 'white' }}>Test Performance Analytics</h2>
          <span style={{ fontSize: '0.72rem', background: 'rgba(59,130,246,0.15)', color: 'var(--accent-primary)', padding: '2px 8px', borderRadius: '20px' }}>
            {reports.length} attempts
          </span>
        </div>
        <button onClick={() => navigate('/test')} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', color: 'white', padding: '6px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
          New Test <ChevronRight size={14} />
        </button>
      </div>

      {/* ── Summary Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
        {[
          { label: 'Avg Accuracy', val: `${avgAcc}%`, icon: Target, color: '#6366f1' },
          { label: 'Best Accuracy', val: `${bestAcc}%`, icon: Trophy, color: '#f59e0b' },
          { label: 'Total Correct', val: totalCorrect.toString(), icon: CheckCircle2, color: '#10b981' },
          { label: 'Total Attempted', val: totalAttempted.toString(), icon: Zap, color: '#ec4899' },
        ].map(s => (
          <div key={s.label} className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <s.icon size={16} color={s.color} />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</span>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* ── Charts Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
        {/* Learning Curve */}
        <div className="glass-panel" style={{ padding: '22px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '0.9rem', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={15} color="#10b981" /> Learning Curve — Accuracy Over Time
          </h3>
          <div style={{ height: '200px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={learningCurveData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" stroke="var(--text-secondary)" tick={{ fontSize: 10 }} />
                <YAxis stroke="var(--text-secondary)" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '0.8rem' }}
                  formatter={(val: any, name: string) => [`${val}%`, 'Accuracy']}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.type ? `${payload[0].payload.type} (${label})` : label}
                />
                <Line type="monotone" dataKey="accuracy" stroke="#6366f1" strokeWidth={2.5} dot={{ fill: '#6366f1', r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Mistake Breakdown */}
        <div className="glass-panel" style={{ padding: '22px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '0.9rem', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={15} color="#f59e0b" /> Mistake Types
          </h3>
          {mistakeData.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {mistakeData.map(m => (
                <div key={m.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{m.name}</span>
                    <span style={{ fontSize: '0.78rem', color: m.color, fontWeight: 700 }}>{m.value}</span>
                  </div>
                  <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(m.value / (mistakeCounts.conceptual + mistakeCounts.calculation + mistakeCounts.speed)) * 100}%`, background: m.color, borderRadius: '4px' }} />
                  </div>
                </div>
              ))}
              <div style={{ marginTop: '8px', padding: '10px', borderRadius: '8px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  Most common: <strong style={{ color: 'white' }}>
                    {mistakeData.sort((a, b) => b.value - a.value)[0]?.name}
                  </strong>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', paddingTop: '20px' }}>
              No mistakes yet!
            </div>
          )}
        </div>
      </div>

      {/* ── Subject Radar ── */}
      {radarData.length > 2 && (
        <div className="glass-panel" style={{ padding: '22px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '0.9rem', color: 'white' }}>Subject Accuracy Profile (latest full mock)</h3>
          <div style={{ height: '200px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgba(255,255,255,0.08)" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <Radar name="Accuracy" dataKey="accuracy" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} strokeWidth={2} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '0.8rem' }} formatter={(v: any) => [`${v}%`, 'Accuracy']} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Weak Topics ── */}
      {weakTopics.length > 0 && (
        <div className="glass-panel" style={{ padding: '22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingDown size={15} color="#ef4444" /> Weak Topics (across all tests)
            </h3>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['all', 'physics', 'chemistry', 'botany', 'zoology'].map(s => (
                <button
                  key={s}
                  onClick={() => setActiveSubjectTab(s)}
                  style={{
                    padding: '3px 10px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600,
                    background: activeSubjectTab === s ? (SUBJECT_COLORS[s] || 'var(--accent-primary)') : 'rgba(255,255,255,0.06)',
                    color: activeSubjectTab === s ? 'white' : 'var(--text-secondary)',
                  }}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filteredWeak.slice(0, 8).map((w, i) => {
              const color = SUBJECT_COLORS[w.subject?.toLowerCase()] || '#ef4444';
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}>
                  <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: '#ef4444', fontWeight: 700, flexShrink: 0 }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'white', fontSize: '0.82rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {w.chapter_name}
                    </div>
                    <div style={{ color: color, fontSize: '0.68rem', textTransform: 'capitalize' }}>{w.subject}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ color: '#ef4444', fontSize: '0.82rem', fontWeight: 700 }}>{w.error_rate}% error</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.68rem' }}>{w.total_attempts} Q</div>
                  </div>
                  <button
                    onClick={() => {
                      const params = new URLSearchParams();
                      params.set('prefill_type', 'practice_drill');
                      params.set('prefill_subject', w.subject || '');
                      params.set('prefill_chapter', w.chapter || '');
                      navigate(`/test?${params.toString()}`);
                    }}
                    style={{ padding: '4px 10px', borderRadius: '6px', border: `1px solid ${color}`, background: `${color}12`, color, cursor: 'pointer', fontSize: '0.68rem', fontWeight: 600, flexShrink: 0 }}
                  >
                    Drill
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Test History ── */}
      <div className="glass-panel" style={{ padding: '22px' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '0.9rem', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={15} color="var(--accent-primary)" /> Recent Test Attempts
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {reports.slice(0, 10).map(r => {
            const typeColor = TYPE_COLORS[r.test_type] || '#6366f1';
            const acc = r.accuracy_pct;
            const accColor = acc >= 70 ? '#10b981' : acc >= 40 ? '#f59e0b' : '#ef4444';
            const isOpen = expandedReport === r.id;
            return (
              <div key={r.id} style={{ borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <button
                  onClick={() => setExpandedReport(isOpen ? null : r.id)}
                  style={{ width: '100%', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.02)', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: typeColor, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '20px', background: `${typeColor}20`, color: typeColor, fontWeight: 600, flexShrink: 0 }}>
                    {TYPE_LABELS[r.test_type] || r.test_type}
                  </span>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <ScoreBar value={r.score} max={r.max_score} color={accColor} />
                  </div>
                  <span style={{ color: accColor, fontWeight: 700, fontSize: '0.9rem', minWidth: '42px', textAlign: 'right' }}>{acc}%</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.68rem', minWidth: '60px', textAlign: 'right' }}>
                    {new Date(r.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && (
                  <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.04)', background: 'rgba(0,0,0,0.2)', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                      {[
                        { label: 'Score', val: `${r.score}/${r.max_score}`, color: accColor },
                        { label: 'Correct', val: r.correct, color: '#10b981' },
                        { label: 'Wrong', val: r.wrong, color: '#ef4444' },
                        { label: 'Skipped', val: r.skipped, color: '#6b7280' },
                      ].map(s => (
                        <div key={s.label} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '1rem', fontWeight: 700, color: s.color }}>{s.val}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                      {r.ai_feedback && (
                        <div style={{ maxWidth: '280px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)', fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                          {r.ai_feedback.slice(0, 150)}{r.ai_feedback.length > 150 ? '...' : ''}
                        </div>
                      )}
                      <button
                        onClick={() => navigate(`/test/results/${r.id}`)}
                        style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', background: 'var(--accent-primary)', color: 'white', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, alignSelf: 'flex-start', whiteSpace: 'nowrap' }}
                      >
                        Full Report →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
