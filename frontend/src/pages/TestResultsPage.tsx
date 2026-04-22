import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  CheckCircle2, XCircle, MinusCircle, BarChart2, BookOpen, Brain,
  TrendingUp, TrendingDown, Clock, Target, ChevronDown, ChevronUp,
  Trophy, AlertTriangle, Zap, RotateCcw, ArrowRight
} from 'lucide-react';
import MathText from '../components/MathText';

const API = 'http://127.0.0.1:8002/api/v1';
const USER = 'user_123';

type Tab = 'overview' | 'review' | 'analysis';

const SUBJECT_COLORS: Record<string, string> = { physics: '#6366f1', chemistry: '#10b981', botany: '#84cc16', zoology: '#f59e0b' };
const SUBJECT_BG: Record<string, string> = { physics: 'rgba(99,102,241,0.15)', chemistry: 'rgba(16,185,129,0.15)', botany: 'rgba(132,204,22,0.15)', zoology: 'rgba(245,158,11,0.15)' };

interface ResultData {
  report_id: string; test_type: string; score: number; max_score: number;
  accuracy_pct: number; correct: number; wrong: number; skipped: number;
  subject_breakdown: Record<string, any>; chapter_breakdown: Record<string, any>;
  mistake_analysis: { conceptual: any[]; calculation: any[]; speed: any[] };
  weak_topics: any[]; strong_topics: any[]; ai_feedback: string | null;
  ai_analysis_status: string; results: any[];
}

const ScoreRing = ({ score, max, color }: { score: number; max: number; color: string }) => {
  const pct = max > 0 ? Math.max(0, score) / max * 100 : 0;
  const r = 52, c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <svg width="130" height="130" viewBox="0 0 130 130">
      <circle cx="65" cy="65" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
      <circle cx="65" cy="65" r={r} fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={`${dash} ${c}`} strokeLinecap="round" transform="rotate(-90 65 65)"
        style={{ transition: 'stroke-dasharray 1s ease' }} />
      <text x="65" y="60" textAnchor="middle" fill="white" fontSize="20" fontWeight="700">{score}</text>
      <text x="65" y="78" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="11">/{max}</text>
    </svg>
  );
};

const MiniBar = ({ value, max, color, label }: { value: number; max: number; color: string; label: string }) => (
  <div style={{ marginBottom: '10px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{label}</span>
      <span style={{ fontSize: '0.78rem', color: 'white', fontWeight: 600 }}>{value}/{max}</span>
    </div>
    <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${max > 0 ? (value / max) * 100 : 0}%`, background: color, borderRadius: '4px', transition: 'width 1s ease' }} />
    </div>
  </div>
);

export default function TestResultsPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const initData = location.state as Partial<ResultData> | null;

  const [data, setData] = useState<ResultData | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [expandedQ, setExpandedQ] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initData);
  const [analysisPolling, setAnalysisPolling] = useState(initData?.ai_analysis_status === 'pending');

  // Fetch full results
  useEffect(() => {
    if (reportId) {
      axios.get(`${API}/test/${reportId}/results`).then(r => {
        setData(r.data);
        setLoading(false);
        if (r.data.ai_analysis_status === 'pending') setAnalysisPolling(true);
      }).catch(() => setLoading(false));
    }
  }, [reportId]);

  // Poll for AI analysis completion
  useEffect(() => {
    if (!analysisPolling || !reportId) return;
    const interval = setInterval(async () => {
      try {
        const r = await axios.get(`${API}/test/${reportId}/results`);
        if (r.data.ai_analysis_status !== 'pending') {
          setData(r.data);
          setAnalysisPolling(false);
          clearInterval(interval);
        }
      } catch (_) {}
    }, 5000);
    return () => clearInterval(interval);
  }, [analysisPolling, reportId]);

  if (loading || !data) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-secondary)' }}>
      Loading results...
    </div>
  );

  const scoreColor = data.accuracy_pct >= 70 ? '#10b981' : data.accuracy_pct >= 40 ? '#f59e0b' : '#ef4444';
  const netPositive = data.score >= 0;

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '0 16px 40px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <Trophy size={28} color={scoreColor} />
          <h1 className="page-title" style={{ margin: 0 }}>Test Results</h1>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0, textTransform: 'capitalize' }}>
          {data.test_type?.replace('_', ' ')} · Completed
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.04)', padding: '4px', borderRadius: '10px', marginBottom: '24px' }}>
        {(['overview', 'review', 'analysis'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '8px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
            background: tab === t ? 'rgba(99,102,241,0.8)' : 'transparent',
            color: tab === t ? 'white' : 'var(--text-secondary)', transition: 'all 0.2s',
          }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === 'overview' && (
        <div>
          {/* Score Hero */}
          <div className="glass-panel" style={{ padding: '28px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '32px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <ScoreRing score={data.score} max={data.max_score} color={scoreColor} />
                <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total Score (NEET +4/-1)</div>
              </div>
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                {[
                  { label: 'Correct', val: data.correct, icon: CheckCircle2, color: '#10b981' },
                  { label: 'Wrong', val: data.wrong, icon: XCircle, color: '#ef4444' },
                  { label: 'Skipped', val: data.skipped, icon: MinusCircle, color: '#6b7280' },
                ].map(item => (
                  <div key={item.label} style={{ textAlign: 'center', padding: '16px', borderRadius: '10px', background: `${item.color}10` }}>
                    <item.icon size={20} color={item.color} style={{ marginBottom: '8px' }} />
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'white' }}>{item.val}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{item.label}</div>
                  </div>
                ))}
                <div style={{ textAlign: 'center', padding: '16px', borderRadius: '10px', background: `${scoreColor}10`, gridColumn: '1/-1' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 700, color: scoreColor }}>{data.accuracy_pct}%</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Overall Accuracy</div>
                </div>
              </div>
            </div>
          </div>

          {/* Subject Breakdown */}
          {data.subject_breakdown && Object.keys(data.subject_breakdown).length > 0 && (
            <div className="glass-panel" style={{ padding: '24px', marginBottom: '20px' }}>
              <h3 style={{ color: 'white', margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem' }}>
                <BarChart2 size={16} color="var(--accent-primary)" /> Subject-wise Performance
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                {Object.entries(data.subject_breakdown).map(([sub, stats]) => {
                  const color = SUBJECT_COLORS[sub.toLowerCase()] || '#6366f1';
                  const bg = SUBJECT_BG[sub.toLowerCase()] || 'rgba(99,102,241,0.15)';
                  const total = stats.correct + stats.wrong + (stats.skipped || 0);
                  const acc = total > 0 ? Math.round((stats.correct / total) * 100) : 0;
                  return (
                    <div key={sub} style={{ padding: '16px', borderRadius: '10px', background: bg, border: `1px solid ${color}30` }}>
                      <div style={{ color, fontWeight: 700, fontSize: '0.85rem', textTransform: 'capitalize', marginBottom: '12px' }}>{sub}</div>
                      <MiniBar value={stats.correct} max={total} color={color} label="Correct" />
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Score: <strong style={{ color }}>{stats.score}</strong></span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Acc: <strong style={{ color }}>{acc}%</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* AI Analysis Card */}
          <div className="glass-panel" style={{ padding: '24px', marginBottom: '20px', borderColor: data.ai_analysis_status === 'ready' ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.08)' }}>
            <h3 style={{ color: 'white', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem' }}>
              <Brain size={16} color="var(--accent-primary)" /> AI Feedback
              {data.ai_analysis_status === 'pending' && <span style={{ marginLeft: 'auto', fontSize: '0.72rem', padding: '2px 8px', borderRadius: '20px', background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>⏳ Preparing...</span>}
              {data.ai_analysis_status === 'ready' && <span style={{ marginLeft: 'auto', fontSize: '0.72rem', padding: '2px 8px', borderRadius: '20px', background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>✓ Ready</span>}
            </h3>
            {data.ai_feedback ? (
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0, fontSize: '0.88rem' }}>{data.ai_feedback}</p>
            ) : (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '12px', borderRadius: '8px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                🔬 We're preparing your detailed AI analysis report. We'll notify you once it's ready — check back shortly or stay on this page.
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/test')} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.04)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 600 }}>
              <RotateCcw size={16} /> New Test
            </button>
            <button onClick={() => setTab('analysis')} style={{ flex: 2, padding: '12px', borderRadius: '8px', border: 'none', background: 'var(--accent-primary)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 600 }}>
              <BarChart2 size={16} /> Full Analysis Dashboard <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── REVIEW TAB ── */}
      {tab === 'review' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {(data.results || []).map((r, i) => {
            const isOpen = expandedQ === r.question_id;
            const color = r.is_correct ? '#10b981' : r.is_skipped ? '#6b7280' : '#ef4444';
            return (
              <div key={r.question_id} className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
                <button
                  onClick={() => setExpandedQ(isOpen ? null : r.question_id)}
                  style={{ width: '100%', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0, background: `${color}20`, color }}>{i + 1}</span>
                  {r.is_correct ? <CheckCircle2 size={16} color="#10b981" /> : r.is_skipped ? <MinusCircle size={16} color="#6b7280" /> : <XCircle size={16} color="#ef4444" />}
                  <span style={{ flex: 1, color: 'white', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.question.replace(/\$[^$]+\$/g, '[math]').slice(0, 100)}{r.question.length > 100 ? '...' : ''}</span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '20px', background: 'rgba(255,255,255,0.06)' }}>
                      <Clock size={9} style={{ marginRight: 4, verticalAlign: 'middle' }} />{Math.round((r.time_taken_ms || 0) / 1000)}s
                    </span>
                    {isOpen ? <ChevronUp size={14} color="var(--text-secondary)" /> : <ChevronDown size={14} color="var(--text-secondary)" />}
                  </div>
                </button>
                {isOpen && (
                  <div style={{ padding: '0 18px 18px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="question-text" style={{ color: 'white', lineHeight: 1.9, margin: '14px 0', fontSize: '0.9rem' }}>
                      <MathText text={r.question} />
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                      {(r.options || []).map((opt: any) => {
                        const isCorrect = opt.label === r.correct_option;
                        const isSelected = opt.label === r.selected_option;
                        let bg = 'rgba(255,255,255,0.03)'; let border = '1px solid rgba(255,255,255,0.06)'; let textColor = 'var(--text-secondary)';
                        if (isCorrect) { bg = 'rgba(16,185,129,0.12)'; border = '1px solid rgba(16,185,129,0.4)'; textColor = '#d1fae5'; }
                        if (isSelected && !isCorrect) { bg = 'rgba(239,68,68,0.12)'; border = '1px solid rgba(239,68,68,0.4)'; textColor = '#fca5a5'; }
                        return (
                          <div key={opt.label} style={{ padding: '8px 14px', borderRadius: '8px', background: bg, border, display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                            <span style={{ fontWeight: 700, color: textColor, minWidth: '20px', fontSize: '0.82rem', flexShrink: 0 }}>{opt.label}.</span>
                            <span className="question-text" style={{ color: textColor, fontSize: '0.82rem', lineHeight: 1.6, flex: 1 }}>
                              <MathText text={opt.text} />
                            </span>
                            {isCorrect && <CheckCircle2 size={14} color="#10b981" style={{ marginLeft: 'auto', flexShrink: 0, marginTop: 2 }} />}
                            {isSelected && !isCorrect && <XCircle size={14} color="#ef4444" style={{ marginLeft: 'auto', flexShrink: 0, marginTop: 2 }} />}
                          </div>
                        );
                      })}
                    </div>
                    {r.solution && (
                      <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Solution</div>
                        <p className="question-text" style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.82rem', lineHeight: 1.8 }}>
                          <MathText text={r.solution} />
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── ANALYSIS TAB ── */}
      {tab === 'analysis' && (
        <div>
          {/* Mistake Type Breakdown */}
          <div className="glass-panel" style={{ padding: '24px', marginBottom: '20px' }}>
            <h3 style={{ color: 'white', margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem' }}>
              <AlertTriangle size={16} color="#f59e0b" /> Mistake Analysis Engine
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
              {[
                { key: 'conceptual', label: 'Conceptual Errors', color: '#ef4444', icon: Brain, desc: 'Core theory gaps' },
                { key: 'calculation', label: 'Calculation Errors', color: '#f59e0b', icon: Target, desc: 'Solve-time mistakes' },
                { key: 'speed', label: 'Speed Errors', color: '#6366f1', icon: Zap, desc: 'Rushed & got wrong' },
              ].map(mt => {
                const count = (data.mistake_analysis?.[mt.key as keyof typeof data.mistake_analysis] || []).length;
                return (
                  <div key={mt.key} style={{ padding: '18px', borderRadius: '10px', background: `${mt.color}10`, border: `1px solid ${mt.color}25`, textAlign: 'center' }}>
                    <mt.icon size={24} color={mt.color} style={{ marginBottom: '10px' }} />
                    <div style={{ fontSize: '1.8rem', fontWeight: 700, color: mt.color }}>{count}</div>
                    <div style={{ fontSize: '0.8rem', color: 'white', fontWeight: 600, marginBottom: '4px' }}>{mt.label}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{mt.desc}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Weak Topics */}
          {(data.weak_topics || []).length > 0 && (
            <div className="glass-panel" style={{ padding: '24px', marginBottom: '20px' }}>
              <h3 style={{ color: 'white', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem' }}>
                <TrendingDown size={16} color="#ef4444" /> Weak Topics (to revise)
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {data.weak_topics.map((wt: any, i: number) => {
                  const color = SUBJECT_COLORS[wt.subject?.toLowerCase()] || '#6366f1';
                  const pct = wt.error_rate;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '8px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 700, fontSize: '0.8rem' }}>#{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: 'white', fontSize: '0.85rem', fontWeight: 600 }}>{wt.chapter_name}</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', textTransform: 'capitalize' }}>{wt.subject}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.9rem' }}>{pct}% error</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{wt.correct}C / {wt.wrong}W</div>
                      </div>
                      <button onClick={() => navigate(`/test`, { state: { prefill: { type: 'practice_drill', subject: wt.subject, chapter: wt.chapter } } })} style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${color}`, background: `${color}15`, color, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, flexShrink: 0 }}>
                        Practice →
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Strong Topics */}
          {(data.strong_topics || []).length > 0 && (
            <div className="glass-panel" style={{ padding: '24px', marginBottom: '20px' }}>
              <h3 style={{ color: 'white', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem' }}>
                <TrendingUp size={16} color="#10b981" /> Strong Topics
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {data.strong_topics.map((st: any, i: number) => (
                  <div key={i} style={{ padding: '6px 14px', borderRadius: '20px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', color: '#10b981', fontSize: '0.78rem', fontWeight: 600 }}>
                    ✓ {st.chapter_name} ({st.accuracy}%)
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chapter Performance Heatmap */}
          {data.chapter_breakdown && Object.keys(data.chapter_breakdown).length > 0 && (
            <div className="glass-panel" style={{ padding: '24px', marginBottom: '20px' }}>
              <h3 style={{ color: 'white', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem' }}>
                <BookOpen size={16} color="var(--accent-primary)" /> Chapter Performance
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {Object.entries(data.chapter_breakdown).map(([ch, stats]: [string, any]) => {
                  const total = stats.correct + stats.wrong + (stats.skipped || 0);
                  if (!total) return null;
                  const acc = Math.round((stats.correct / total) * 100);
                  const color = acc >= 70 ? '#10b981' : acc >= 40 ? '#f59e0b' : '#ef4444';
                  return (
                    <div key={ch} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '130px', fontSize: '0.72rem', color: 'var(--text-secondary)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {stats.chapter_name || ch}
                      </div>
                      <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${acc}%`, background: color, borderRadius: '4px' }} />
                      </div>
                      <span style={{ width: '36px', textAlign: 'right', fontSize: '0.72rem', color, fontWeight: 600 }}>{acc}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
