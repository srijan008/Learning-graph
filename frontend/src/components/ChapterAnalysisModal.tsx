/**
 * ChapterAnalysisModal
 * =====================
 * Full-screen modal showing deep analysis of a single chapter across:
 *   - Test history   (score trend, accuracy, time)
 *   - Learning progress (topic/subtopic confidence tree)
 *   - Error analysis  (per-question correct/wrong from latest test)
 *   - Strong / Weak subtopics
 *   - AI Recommendations
 */
import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  X, BookOpen, BarChart2, Target, Clock, TrendingUp, TrendingDown,
  CheckCircle2, XCircle, AlertTriangle, Lightbulb, Zap, ChevronRight,
  Brain, Trophy, RotateCcw
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, BarChart, Bar, Cell
} from 'recharts';

const API = 'http://127.0.0.1:8002/api/v1';

const SUBJECT_COLORS: Record<string, string> = {
  physics: '#6366f1', chemistry: '#10b981', botany: '#84cc16', zoology: '#f59e0b',
};
const PRIORITY_COLORS = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' };
const STATUS_CONFIG = {
  completed:   { color: '#10b981', label: 'Mastered' },
  in_progress: { color: '#6366f1', label: 'Learning' },
  not_started: { color: '#6b7280', label: 'Not Started' },
};

interface Props {
  chapter: string;
  chapterName: string;
  subject?: string;
  userId: string;
  onClose: () => void;
  onStartTest?: (chapter: string, subject: string) => void;
}

type Tab = 'overview' | 'subtopics' | 'test-history' | 'recommendations';

function ConfidenceBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const color = pct >= 65 ? '#10b981' : pct >= 35 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ height: '7px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '4px', transition: 'width 0.8s ease' }} />
    </div>
  );
}

export default function ChapterAnalysisModal({ chapter, chapterName, subject = '', userId, onClose, onStartTest }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const navigate = useNavigate();

  useEffect(() => {
    axios.get(`${API}/dashboard/${userId}/chapter-detail`, { params: { chapter } })
      .then(r => { setData(r.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [chapter, userId]);

  const subjColor = SUBJECT_COLORS[(data?.subject || subject).toLowerCase()] || '#6366f1';

  // Trend data for line chart
  const trendData = (data?.test_history || []).slice().reverse().map((h: any, i: number) => ({
    attempt: `#${i + 1}`,
    accuracy: h.accuracy,
    date: new Date(h.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
  }));

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart2 },
    { id: 'subtopics', label: 'Topics', icon: BookOpen },
    { id: 'test-history', label: 'Test History', icon: Clock },
    { id: 'recommendations', label: 'Action Plan', icon: Lightbulb },
  ];

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(6px)', zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div style={{
        width: '100%', maxWidth: '860px', maxHeight: '90vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)', display: 'flex',
        flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* ── Header ── */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'flex-start', gap: '14px',
        }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '12px', flexShrink: 0,
            background: `${subjColor}20`, border: `1px solid ${subjColor}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <BookOpen size={22} color={subjColor} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: '0 0 2px', color: 'white', fontSize: '1.15rem', fontWeight: 700 }}>
              {data?.chapter_name || chapterName}
            </h2>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              {(data?.subject || subject) && (
                <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '20px', background: `${subjColor}20`, color: subjColor, fontWeight: 600, textTransform: 'capitalize' }}>
                  {data?.subject || subject}
                </span>
              )}
              {data && (
                <>
                  {data.test_attempts > 0 && <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{data.test_attempts} test{data.test_attempts > 1 ? 's' : ''} taken</span>}
                  {data.learning_sessions > 0 && <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{data.learning_sessions} study session{data.learning_sessions > 1 ? 's' : ''}</span>}
                </>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            {onStartTest && (
              <button
                onClick={() => onStartTest(chapter, data?.subject || subject)}
                style={{ padding: '7px 16px', borderRadius: '8px', border: `1px solid ${subjColor}`, background: `${subjColor}20`, color: subjColor, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}
              >
                <Zap size={13} /> Practice
              </button>
            )}
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '7px', color: 'white', cursor: 'pointer', display: 'flex' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 24px', gap: '0' }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: '0.8rem', fontWeight: activeTab === t.id ? 700 : 400,
                color: activeTab === t.id ? subjColor : 'var(--text-secondary)',
                borderBottom: activeTab === t.id ? `2px solid ${subjColor}` : '2px solid transparent',
                display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s',
              }}
            >
              <t.icon size={13} /> {t.label}
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              Loading chapter analysis...
            </div>
          ) : !data ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              No data found for this chapter yet.
            </div>
          ) : (
            <>
              {/* ─── OVERVIEW ─── */}
              {activeTab === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  {/* Quick stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                    {[
                      { label: 'Avg Accuracy', val: `${data.avg_accuracy}%`, icon: Target, color: data.avg_accuracy >= 60 ? '#10b981' : '#f59e0b' },
                      { label: 'Confidence', val: `${data.avg_confidence}%`, icon: Brain, color: '#6366f1' },
                      { label: 'Study Time', val: `${data.study_time_minutes}m`, icon: Clock, color: '#84cc16' },
                      { label: 'Tests Taken', val: data.test_attempts, icon: BarChart2, color: '#f59e0b' },
                    ].map(s => (
                      <div key={s.label} style={{ padding: '14px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', textAlign: 'center' }}>
                        <s.icon size={18} color={s.color} style={{ marginBottom: '6px' }} />
                        <div style={{ fontSize: '1.3rem', fontWeight: 700, color: s.color }}>{s.val}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Accuracy trend */}
                  {trendData.length > 1 && (
                    <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <h4 style={{ margin: '0 0 12px', color: 'white', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '7px' }}>
                        <TrendingUp size={13} color="#10b981" /> Accuracy Trend
                      </h4>
                      <div style={{ height: '140px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={trendData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis dataKey="date" stroke="var(--text-secondary)" tick={{ fontSize: 9 }} />
                            <YAxis stroke="var(--text-secondary)" domain={[0, 100]} tick={{ fontSize: 9 }} unit="%" />
                            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '0.75rem' }} formatter={(v: any) => [`${v}%`, 'Accuracy']} />
                            <Line type="monotone" dataKey="accuracy" stroke={subjColor} strokeWidth={2.5} dot={{ fill: subjColor, r: 4 }} activeDot={{ r: 6 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Test stats bar */}
                  {data.test_attempts > 0 && (
                    <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <h4 style={{ margin: '0 0 12px', color: 'white', fontSize: '0.85rem' }}>All-Time Test Performance</h4>
                      <div style={{ display: 'flex', gap: '4px', height: '28px', borderRadius: '8px', overflow: 'hidden' }}>
                        {[
                          { val: data.total_correct, color: '#10b981', label: 'Correct' },
                          { val: data.total_wrong, color: '#ef4444', label: 'Wrong' },
                          { val: data.total_skipped, color: '#6b7280', label: 'Skipped' },
                        ].map(s => {
                          const total = data.total_correct + data.total_wrong + data.total_skipped;
                          const pct = total > 0 ? (s.val / total) * 100 : 0;
                          return pct > 0 ? (
                            <div key={s.label} title={`${s.label}: ${s.val}`} style={{ background: s.color, flex: pct, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: 'white', fontWeight: 700, minWidth: pct > 5 ? 'auto' : 0 }}>
                              {pct > 8 ? `${Math.round(pct)}%` : ''}
                            </div>
                          ) : null;
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
                        {[
                          { label: 'Correct', val: data.total_correct, color: '#10b981' },
                          { label: 'Wrong', val: data.total_wrong, color: '#ef4444' },
                          { label: 'Skipped', val: data.total_skipped, color: '#6b7280' },
                          { label: 'Time', val: `${Math.round(data.total_time_on_chapter_ms / 60000)}m`, color: '#a5b4fc' },
                        ].map(s => (
                          <div key={s.label} style={{ display: 'flex', gap: '5px', alignItems: 'center', fontSize: '0.75rem' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color }} />
                            <span style={{ color: 'var(--text-secondary)' }}>{s.label}:</span>
                            <span style={{ color: s.color, fontWeight: 700 }}>{s.val}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Strong / Weak summary */}
                  {(data.strong_subtopics.length > 0 || data.weak_subtopics.length > 0) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                          <Trophy size={13} color="#10b981" />
                          <span style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 700 }}>Strong ({data.strong_subtopics.length})</span>
                        </div>
                        {data.strong_subtopics.slice(0, 4).map((s: any) => (
                          <div key={s.subtopic_id} style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.8)', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{s.subtopic_name}</span>
                            <span style={{ color: '#10b981', fontWeight: 700 }}>{s.confidence}%</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                          <TrendingDown size={13} color="#ef4444" />
                          <span style={{ fontSize: '0.78rem', color: '#ef4444', fontWeight: 700 }}>Needs Work ({data.weak_subtopics.length})</span>
                        </div>
                        {data.weak_subtopics.slice(0, 4).map((s: any) => (
                          <div key={s.subtopic_id} style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.8)', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{s.subtopic_name}</span>
                            <span style={{ color: '#ef4444', fontWeight: 700 }}>{s.confidence}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ─── SUBTOPICS ─── */}
              {activeTab === 'subtopics' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {data.subtopics.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                      <Brain size={32} style={{ marginBottom: '10px', opacity: 0.4 }} />
                      <p>No learning session data yet. Start studying this chapter!</p>
                      <button onClick={() => navigate(`/learning/chapter/${chapter}/graph`)} style={{ marginTop: '12px', padding: '8px 20px', borderRadius: '8px', background: subjColor, border: 'none', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                        Start Learning
                      </button>
                    </div>
                  ) : (
                    data.subtopics.map((sub: any) => {
                      const conf = sub.confidence;
                      const confColor = conf >= 65 ? '#10b981' : conf >= 35 ? '#f59e0b' : '#ef4444';
                      const statusCfg = STATUS_CONFIG[sub.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.not_started;
                      return (
                        <div key={sub.subtopic_id} style={{ padding: '14px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${confColor}20`, transition: 'all 0.15s' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <span style={{ color: 'white', fontSize: '0.85rem', fontWeight: 600 }}>{sub.subtopic_name}</span>
                                <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '10px', background: `${statusCfg.color}20`, color: statusCfg.color, fontWeight: 600 }}>
                                  {statusCfg.label}
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <ConfidenceBar value={conf} />
                                <span style={{ fontWeight: 700, color: confColor, fontSize: '0.82rem', minWidth: '35px' }}>{conf}%</span>
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                <Clock size={9} style={{ marginRight: 3, verticalAlign: 'middle' }} />{sub.study_time_minutes}m
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* ─── TEST HISTORY ─── */}
              {activeTab === 'test-history' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {data.test_history.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                      <BarChart2 size={32} style={{ marginBottom: '10px', opacity: 0.4 }} />
                      <p>No test attempts for this chapter yet.</p>
                    </div>
                  ) : (
                    <>
                      {/* Attempt cards */}
                      {data.test_history.map((h: any, i: number) => {
                        const acc = h.accuracy;
                        const accColor = acc >= 70 ? '#10b981' : acc >= 40 ? '#f59e0b' : '#ef4444';
                        return (
                          <div key={i} style={{ padding: '14px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: `${accColor}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {acc >= 60 ? <CheckCircle2 size={16} color={accColor} /> : <XCircle size={16} color={accColor} />}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                                <span style={{ fontSize: '0.72rem', padding: '1px 7px', borderRadius: '10px', background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', fontWeight: 600 }}>
                                  {h.test_type.replace('_', ' ')}
                                </span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                  {new Date(h.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: '2-digit' })}
                                </span>
                              </div>
                              <div style={{ display: 'flex', gap: '14px', fontSize: '0.72rem' }}>
                                <span style={{ color: '#10b981' }}>✓ {h.correct}</span>
                                <span style={{ color: '#ef4444' }}>✗ {h.wrong}</span>
                                <span style={{ color: '#6b7280' }}>— {h.skipped}</span>
                                <span style={{ color: '#a5b4fc' }}><Clock size={9} style={{ verticalAlign: 'middle', marginRight: 3 }} />{Math.round(h.time_ms / 60000)}m</span>
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: accColor }}>{acc}%</div>
                              {h.report_id && (
                                <button onClick={() => { onClose(); navigate(`/test/results/${h.report_id}`); }} style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '2px' }}>
                                  Full report <ChevronRight size={10} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}

              {/* ─── RECOMMENDATIONS ─── */}
              {activeTab === 'recommendations' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {data.recommendations.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                      <Trophy size={32} color="#f59e0b" style={{ marginBottom: '10px' }} />
                      <p style={{ color: 'white', fontWeight: 600 }}>No specific recommendations right now!</p>
                      <p style={{ fontSize: '0.85rem' }}>Take a test or study session to get personalized recommendations.</p>
                    </div>
                  ) : (
                    <>
                      <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '8px' }}>
                        <Lightbulb size={14} color="var(--accent-primary)" style={{ flexShrink: 0, marginTop: 1 }} />
                        <span>Based on your test performance and study sessions in <strong style={{ color: 'white' }}>{data.chapter_name}</strong></span>
                      </div>
                      {data.recommendations.map((rec: any, i: number) => {
                        const pColor = PRIORITY_COLORS[rec.priority as keyof typeof PRIORITY_COLORS] || '#6b7280';
                        const icons = { re_study: RotateCcw, practice: Target, advance: TrendingUp };
                        const Icon = icons[rec.type as keyof typeof icons] || Zap;
                        return (
                          <div key={i} style={{ padding: '14px 16px', borderRadius: '10px', background: `${pColor}08`, border: `1px solid ${pColor}20` }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${pColor}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Icon size={15} color={pColor} />
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                  <span style={{ color: 'white', fontWeight: 600, fontSize: '0.85rem' }}>{rec.subtopic}</span>
                                  <span style={{ fontSize: '0.65rem', padding: '1px 7px', borderRadius: '10px', background: `${pColor}20`, color: pColor, fontWeight: 700, textTransform: 'uppercase' }}>
                                    {rec.priority}
                                  </span>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{rec.reason}</p>
                              </div>
                              {rec.type === 're_study' && (
                                <button onClick={() => navigate(`/learning/chapter/${chapter}/graph?autoStudy=1`)} style={{ padding: '5px 12px', borderRadius: '7px', border: 'none', background: pColor, color: 'white', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, flexShrink: 0 }}>
                                  Study
                                </button>
                              )}
                              {rec.type === 'practice' && onStartTest && (
                                <button onClick={() => onStartTest(chapter, data.subject)} style={{ padding: '5px 12px', borderRadius: '7px', border: 'none', background: pColor, color: 'white', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, flexShrink: 0 }}>
                                  Test
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
