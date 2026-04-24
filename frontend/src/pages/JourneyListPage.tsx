import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { TrendingUp, Plus, Trash2, ChevronRight, Loader2, Map as MapIcon } from 'lucide-react';

const API_URL = 'http://127.0.0.1:8002/api/v1';
const MOCK_USER = 'user_123';

export default function JourneyListPage() {
  const navigate = useNavigate();
  const [journeys, setJourneys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadJourneys = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/journey/list/${MOCK_USER}`);
      setJourneys(res.data || []);
    } catch { setJourneys([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadJourneys(); }, []);

  const deleteJourney = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this journey?')) return;
    await axios.delete(`${API_URL}/journey/${id}`);
    loadJourneys();
  };

  const difficultyBadge: Record<string, { label: string; color: string }> = {
    standard: { label: '📈 Standard', color: '#6366f1' },
    accelerated: { label: '⚡ Accelerated', color: '#f59e0b' },
    deep_dive: { label: '🔬 Deep Dive', color: '#10b981' },
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '860px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <MapIcon size={28} color="#6366f1" />
          <div>
            <h1 className="page-title" style={{ margin: 0 }}>My Learning Journeys</h1>
            <p style={{ color: 'var(--text-secondary)', margin: '2px 0 0', fontSize: '0.85rem' }}>
              {journeys.length} journey{journeys.length !== 1 ? 's' : ''} created
            </p>
          </div>
        </div>
        <button onClick={() => navigate('/journey/new')} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px' }}>
          <Plus size={16} /> New Journey
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)' }}>
          <Loader2 size={32} style={{ animation: 'spin 0.8s linear infinite', margin: '0 auto 12px', display: 'block' }} />
          Loading journeys...
        </div>
      ) : journeys.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '60px 40px' }}>
          <TrendingUp size={48} color="#6366f1" style={{ marginBottom: '16px', opacity: 0.5 }} />
          <h2 style={{ color: 'white', margin: '0 0 8px' }}>No journeys yet</h2>
          <p style={{ color: 'var(--text-secondary)', margin: '0 0 24px' }}>
            Create your first personalized learning journey to get started.
          </p>
          <button onClick={() => navigate('/journey/new')} className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={16} /> Create My First Journey
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {journeys.map(j => {
            const badge = difficultyBadge[j.difficulty] || difficultyBadge.standard;
            return (
              <div
                key={j.id}
                onClick={() => navigate(`/journey/${j.id}`)}
                className="glass-panel"
                style={{ padding: '20px 24px', cursor: 'pointer', transition: 'border-color 0.2s, transform 0.1s', borderColor: 'rgba(255,255,255,0.08)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#6366f1'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLDivElement).style.transform = 'none'; }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, color: 'white', fontSize: '1rem', fontWeight: 600 }}>{j.goal}</h3>
                      <span style={{ padding: '2px 8px', borderRadius: '10px', background: `${badge.color}22`, color: badge.color, fontSize: '0.68rem', fontWeight: 600 }}>
                        {badge.label}
                      </span>
                      <span style={{ padding: '2px 8px', borderRadius: '10px', background: j.status === 'completed' ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.12)', color: j.status === 'completed' ? '#10b981' : '#a5b4fc', fontSize: '0.68rem' }}>
                        {j.status}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                      <div style={{ flex: 1, height: '5px', background: 'rgba(255,255,255,0.07)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${j.progress_pct}%`, background: j.progress_pct === 100 ? '#10b981' : 'linear-gradient(90deg, #6366f1, #10b981)', borderRadius: '3px', transition: 'width 0.6s ease' }} />
                      </div>
                      <span style={{ color: j.progress_pct > 0 ? '#10b981' : 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {j.completed_topics}/{j.total_topics} ({j.progress_pct}%)
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '16px', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
                      <span>📅 {j.study_span_months}mo span</span>
                      <span>⏰ {j.weekly_hours}h/week</span>
                      <span>⏱️ ~{j.estimated_total_hours}h total</span>
                      <span style={{ marginLeft: 'auto', opacity: 0.5 }}>
                        {new Date(j.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <button
                      onClick={(e) => deleteJourney(j.id, e)}
                      style={{ padding: '6px', borderRadius: '6px', border: 'none', background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                      <Trash2 size={14} />
                    </button>
                    <ChevronRight size={18} color="#6366f1" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
