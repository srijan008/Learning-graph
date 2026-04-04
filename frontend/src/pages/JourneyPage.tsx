import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import ReactFlow, {
  Controls, Background, MiniMap, useNodesState, useEdgesState,
  BackgroundVariant, Handle, Position, Panel,
} from 'reactflow';
import dagre from '@dagrejs/dagre';
import 'reactflow/dist/style.css';
import {
  Map, List, Calendar, ArrowLeft, CheckCircle2,
  Loader2, Lock, Circle, Clock, BookOpen, TrendingUp, Zap,
} from 'lucide-react';

const API_URL = 'http://127.0.0.1:8002/api/v1';
const MOCK_USER = 'user_123';

// ── Subject colours ───────────────────────────────────────────────────────────
const SUBJECT_COLORS: Record<string, string> = {
  physics: '#6366f1',
  chemistry: '#10b981',
  biology: '#f59e0b',
  mathematics: '#ec4899',
  default: '#0ea5e9',
};

function subjectColor(name: string): string {
  const l = (name || '').toLowerCase();
  for (const [k, v] of Object.entries(SUBJECT_COLORS)) {
    if (l.includes(k)) return v;
  }
  return SUBJECT_COLORS.default;
}

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { icon: string; border: string; bg: string; text: string }> = {
  locked:      { icon: '🔒', border: '#334155', bg: 'rgba(30,41,59,0.9)',    text: '#64748b' },
  available:   { icon: '📖', border: '',        bg: '',                       text: 'white'   },
  in_progress: { icon: '⚡', border: '#d97706', bg: 'rgba(217,119,6,0.15)',   text: 'white'   },
  completed:   { icon: '✅', border: '#10b981', bg: 'rgba(16,185,129,0.15)',  text: '#10b981' },
};

// ── Custom Node ───────────────────────────────────────────────────────────────
function JourneyNode({ data }: { data: any }) {
  const sc = subjectColor(data.subject || '');
  const st = STATUS_CONFIG[data.status] || STATUS_CONFIG.available;
  const border = data.status === 'available' ? sc : st.border;
  const bg = data.status === 'available' ? `${sc}18` : st.bg;
  const isClickable = data.status !== 'locked';

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: border, width: 8, height: 8, border: 'none' }}
      />
      <div
        onClick={isClickable ? data.onClick : undefined}
        style={{
          width: 190,
          padding: '10px 12px',
          borderRadius: 12,
          border: `1.5px solid ${border}`,
          background: bg,
          cursor: isClickable ? 'pointer' : 'default',
          boxShadow: isClickable && data.status !== 'locked'
            ? `0 0 14px ${border}55, 0 2px 8px rgba(0,0,0,0.4)`
            : '0 2px 6px rgba(0,0,0,0.3)',
          transition: 'transform 0.15s, box-shadow 0.15s',
          userSelect: 'none',
        }}
        onMouseEnter={e => {
          if (isClickable) {
            (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.03)';
            (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 20px ${border}88, 0 4px 12px rgba(0,0,0,0.5)`;
          }
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)';
          (e.currentTarget as HTMLDivElement).style.boxShadow = isClickable
            ? `0 0 14px ${border}55, 0 2px 8px rgba(0,0,0,0.4)`
            : '0 2px 6px rgba(0,0,0,0.3)';
        }}
      >
        {/* Subject colour stripe */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          borderRadius: '12px 12px 0 0',
          background: data.status === 'locked' ? '#334155' : sc,
        }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 4 }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>{st.icon}</span>
          <span style={{ color: st.text, fontSize: '0.76rem', fontWeight: 600, lineHeight: 1.4 }}>
            {data.label}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 5, marginTop: 7, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '0.6rem', padding: '2px 7px', borderRadius: 4,
            background: data.status === 'locked' ? '#1e293b' : `${sc}25`,
            color: data.status === 'locked' ? '#475569' : sc,
            fontWeight: 600,
          }}>
            {data.subject}
          </span>
          <span style={{
            fontSize: '0.6rem', padding: '2px 7px', borderRadius: 4,
            background: 'rgba(255,255,255,0.05)', color: '#94a3b8',
          }}>
            Wk {data.week} · {data.hours}h
          </span>
        </div>

        <div style={{
          marginTop: 5, fontSize: '0.58rem', color: '#64748b',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {data.chapter}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: border, width: 8, height: 8, border: 'none' }}
      />
    </>
  );
}

const nodeTypes = { journeyNode: JourneyNode };

// ── Dagre layout ──────────────────────────────────────────────────────────────
const NODE_W = 210;
const NODE_H = 100;

function applyDagreLayout(nodes: any[], edges: any[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 80, marginx: 40, marginy: 40 });

  nodes.forEach(n => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach(e => g.setEdge(e.source, e.target));
  dagre.layout(g);

  return nodes.map(n => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 } };
  });
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function JourneyPage() {
  const { journeyId } = useParams<{ journeyId: string }>();
  const navigate = useNavigate();

  const [journey, setJourney] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'graph' | 'roadmap' | 'schedule'>('graph');
  const [completing, setCompleting] = useState<string | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const loadJourney = useCallback(async () => {
    if (!journeyId) return;
    setLoading(true);
    try {
      const [journeyRes, graphRes] = await Promise.all([
        axios.get(`${API_URL}/journey/${journeyId}`),
        axios.get(`${API_URL}/journey/${journeyId}/graph`),
      ]);
      setJourney(journeyRes.data);

      const rawNodes: any[] = graphRes.data.nodes || [];
      let rawEdges: any[] = graphRes.data.edges || [];

      // ── Synthetic edges: link topics within the same chapter sequentially
      // Group by chapter
      if (rawEdges.length === 0) {
        const byChapter: Record<string, any[]> = {};
        rawNodes.forEach(n => {
          const ch = n.data.chapter || 'unknown';
          if (!byChapter[ch]) byChapter[ch] = [];
          byChapter[ch].push(n);
        });
        Object.values(byChapter).forEach(group => {
          for (let i = 0; i < group.length - 1; i++) {
            const sc = subjectColor(group[i].data.subject || '');
            rawEdges.push({
              id: `chain-${group[i].id}-${group[i + 1].id}`,
              source: group[i].id,
              target: group[i + 1].id,
              type: 'smoothstep',
              animated: false,
              style: { stroke: sc, strokeWidth: 1.5, opacity: 0.6, strokeDasharray: '4,4' },
              markerEnd: { type: 'arrowclosed', color: sc, width: 14, height: 14 },
            });
          }
        });
      } else {
        // Style Neo4j edges nicely
        rawEdges = rawEdges.map(e => ({
          ...e,
          style: { stroke: '#6366f1', strokeWidth: 2 },
          markerEnd: { type: 'arrowclosed', color: '#6366f1', width: 16, height: 16 },
          label: '⚡ requires',
          labelStyle: { fontSize: 10, fill: '#a5b4fc' },
          labelBgStyle: { fill: 'rgba(15,23,42,0.8)' },
        }));
      }

      // Attach click handlers
      const enrichedNodes = rawNodes.map(n => ({
        ...n,
        data: {
          ...n.data,
          onClick: n.data.status !== 'locked' ? () => navigate(`/learning/${n.id}`) : undefined,
        },
      }));

      // Apply dagre layout
      const laidOutNodes = applyDagreLayout(enrichedNodes, rawEdges);
      setNodes(laidOutNodes);
      setEdges(rawEdges);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to load journey');
    } finally {
      setLoading(false);
    }
  }, [journeyId, navigate]);

  useEffect(() => { loadJourney(); }, [loadJourney]);

  const completeNode = async (topicId: string) => {
    setCompleting(topicId);
    try {
      await axios.post(`${API_URL}/journey/${journeyId}/node/${topicId}/complete`, { user_id: MOCK_USER });
      await loadJourney();
    } catch { /* noop */ }
    finally { setCompleting(null); }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16, color: 'var(--text-secondary)' }}>
        <Loader2 size={36} style={{ animation: 'spin 0.8s linear infinite' }} />
        <p style={{ margin: 0 }}>Building your learning journey...</p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#fca5a5' }}>
        <p>⚠️ {error}</p>
        <button onClick={() => navigate('/journey/new')} className="btn btn-primary" style={{ marginTop: 16 }}>
          Create New Journey
        </button>
      </div>
    );
  }

  const progressPct = journey?.progress_pct ?? 0;
  const diffLabels: Record<string, string> = { standard: '📈 Standard', accelerated: '⚡ Accelerated', deep_dive: '🔬 Deep Dive' };

  // Group nodes for roadmap
  const nodesByWeek: Record<number, any[]> = {};
  for (const n of journey?.nodes || []) {
    const wk = n.week_number || 1;
    if (!nodesByWeek[wk]) nodesByWeek[wk] = [];
    nodesByWeek[wk].push(n);
  }

  // Group nodes by subject for schedule
  const nodesBySubject: Record<string, any[]> = {};
  for (const n of journey?.nodes || []) {
    const sub = n.subject_name || 'General';
    if (!nodesBySubject[sub]) nodesBySubject[sub] = [];
    nodesBySubject[sub].push(n);
  }

  // Count subject node stats for legend
  const subjectStats = Object.entries(nodesBySubject).map(([sub, ns], i) => ({
    name: sub,
    color: subjectColor(sub),
    count: (ns as any[]).length,
    done: (ns as any[]).filter((n: any) => n.node_status === 'completed').length,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', overflow: 'hidden' }}>
      {/* ── Top Bar ── */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border-color)', background: 'rgba(10,15,25,0.95)', backdropFilter: 'blur(10px)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/journey/list')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
            <ArrowLeft size={15} /> Back
          </button>
          <div style={{ width: 1, height: 18, background: 'var(--border-color)' }} />
          <TrendingUp size={15} color="#6366f1" />
          <span style={{ color: 'white', fontWeight: 600, fontSize: '0.9rem', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {journey?.goal}
          </span>
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
            {[
              { icon: <BookOpen size={11} />, label: `${journey?.total_topics} topics` },
              { icon: <Clock size={11} />, label: `~${Math.round(journey?.estimated_total_hours || 0)}h` },
              { icon: <Zap size={11} />, label: diffLabels[journey?.difficulty] || '' },
            ].map(chip => (
              <span key={chip.label} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 20, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)', color: '#a5b4fc', fontSize: '0.68rem', fontWeight: 500 }}>
                {chip.icon} {chip.label}
              </span>
            ))}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progressPct}%`, background: 'linear-gradient(90deg,#6366f1,#10b981)', borderRadius: 3, transition: 'width 0.6s ease' }} />
          </div>
          <span style={{ color: progressPct > 0 ? '#10b981' : 'var(--text-secondary)', fontSize: '0.7rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {journey?.completed_topics}/{journey?.total_topics} ({progressPct}%)
          </span>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, marginTop: 10 }}>
          {([
            { key: 'graph', label: 'Graph', icon: <Map size={13} /> },
            { key: 'roadmap', label: 'Roadmap', icon: <List size={13} /> },
            { key: 'schedule', label: 'Schedule', icon: <Calendar size={13} /> },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 14px', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500,
                background: activeTab === tab.key ? 'rgba(99,102,241,0.18)' : 'transparent',
                color: activeTab === tab.key ? '#a5b4fc' : 'var(--text-secondary)',
                borderBottom: activeTab === tab.key ? '2px solid #6366f1' : '2px solid transparent',
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── GRAPH TAB ── */}
      {activeTab === 'graph' && (
        <div style={{ flex: 1, position: 'relative' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
            minZoom={0.05}
            maxZoom={1.5}
            style={{ background: '#080f1f' }}
            defaultEdgeOptions={{ type: 'smoothstep' }}
          >
            <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="#1e293b" />
            <Controls
              style={{ background: 'rgba(10,15,25,0.9)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
            <MiniMap
              nodeColor={n => subjectColor((n.data as any)?.subject || '')}
              maskColor="rgba(0,0,0,0.65)"
              style={{ background: 'rgba(10,15,25,0.9)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}
            />

            {/* Legend panel */}
            <Panel position="top-right">
              <div style={{ background: 'rgba(10,15,25,0.92)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px', minWidth: 180 }}>
                <p style={{ color: 'white', fontWeight: 600, fontSize: '0.75rem', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Subjects</p>
                {subjectStats.map(s => (
                  <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                    <span style={{ color: '#94a3b8', fontSize: '0.72rem', flex: 1 }}>{s.name}</span>
                    <span style={{ color: s.color, fontSize: '0.68rem', fontWeight: 600 }}>{s.done}/{s.count}</span>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', marginTop: 10, paddingTop: 10 }}>
                  <p style={{ color: 'white', fontWeight: 600, fontSize: '0.72rem', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</p>
                  {[
                    { icon: '🔒', label: 'Locked', color: '#334155' },
                    { icon: '📖', label: 'Available', color: '#6366f1' },
                    { icon: '⚡', label: 'In Progress', color: '#d97706' },
                    { icon: '✅', label: 'Done', color: '#10b981' },
                  ].map(l => (
                    <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                      <span style={{ fontSize: 11 }}>{l.icon}</span>
                      <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{l.label}</span>
                    </div>
                  ))}
                </div>
                <p style={{ color: '#475569', fontSize: '0.62rem', margin: '8px 0 0', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8 }}>
                  ···  Dashed = chapter sequence<br />
                  ──→ Solid = prerequisite
                </p>
              </div>
            </Panel>
          </ReactFlow>
        </div>
      )}

      {/* ── ROADMAP TAB ── */}
      {activeTab === 'roadmap' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {Object.entries(nodesByWeek).map(([week, wNodes]) => (
            <div key={week} style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ padding: '3px 12px', borderRadius: 20, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', fontSize: '0.72rem', fontWeight: 600 }}>
                  Week {week}
                </div>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.68rem' }}>
                  {(wNodes as any[]).reduce((s: number, n: any) => s + (n.estimated_hours || 0), 0).toFixed(1)}h
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 8 }}>
                {(wNodes as any[]).map((n: any) => {
                  const sc = subjectColor(n.subject_name || '');
                  const isDone = n.node_status === 'completed';
                  const isAvail = n.node_status === 'available' || n.node_status === 'in_progress';
                  return (
                    <div key={n.topic_id} style={{
                      padding: '11px 14px', borderRadius: 10,
                      border: `1px solid ${isDone ? 'rgba(16,185,129,0.3)' : isAvail ? `${sc}40` : 'rgba(255,255,255,0.05)'}`,
                      background: isDone ? 'rgba(16,185,129,0.07)' : isAvail ? `${sc}0D` : 'rgba(255,255,255,0.02)',
                      display: 'flex', flexDirection: 'column', gap: 7,
                      borderLeft: `3px solid ${isDone ? '#10b981' : isAvail ? sc : '#334155'}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>
                          {isDone ? '✅' : isAvail ? '📖' : '🔒'}
                        </span>
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, color: n.node_status === 'locked' ? '#475569' : 'white', fontSize: '0.83rem', fontWeight: 600, lineHeight: 1.4 }}>
                            {n.topic_name}
                          </p>
                          <p style={{ margin: '2px 0 0', color: 'var(--text-secondary)', fontSize: '0.7rem' }}>
                            {n.subject_name} › {n.chapter_name}
                          </p>
                        </div>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.68rem', flexShrink: 0 }}>{n.estimated_hours}h</span>
                      </div>
                      {!isDone && (
                        <div style={{ display: 'flex', gap: 5 }}>
                          {isAvail && (
                            <button onClick={() => navigate(`/learning/${n.topic_id}`)} style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: `1px solid ${sc}55`, background: `${sc}15`, color: sc, fontSize: '0.68rem', cursor: 'pointer', fontWeight: 600 }}>
                              Study Now
                            </button>
                          )}
                          <button onClick={() => completeNode(n.topic_id)} disabled={completing === n.topic_id} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.08)', color: '#10b981', fontSize: '0.68rem', cursor: 'pointer' }}>
                            {completing === n.topic_id ? '...' : '✓ Done'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── SCHEDULE TAB ── */}
      {activeTab === 'schedule' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 28 }}>
            {[
              { label: 'Total Topics', value: journey?.total_topics, color: '#6366f1', icon: '📚' },
              { label: 'Total Hours', value: `${Math.round(journey?.estimated_total_hours || 0)}h`, color: '#10b981', icon: '⏱️' },
              { label: 'Weekly Hours', value: `${journey?.weekly_hours}h/week`, color: '#f59e0b', icon: '📅' },
              { label: 'Session', value: journey?.session_minutes >= 60 ? `${journey.session_minutes / 60}h` : `${journey?.session_minutes}m`, color: '#ec4899', icon: '⌛' },
            ].map(s => (
              <div key={s.label} style={{ padding: 16, borderRadius: 12, background: `${s.color}11`, border: `1px solid ${s.color}33` }}>
                <div style={{ fontSize: '1.1rem', marginBottom: 5 }}>{s.icon}</div>
                <div style={{ color: s.color, fontSize: '1.3rem', fontWeight: 700 }}>{s.value}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>{s.label}</div>
              </div>
            ))}
          </div>
          {Object.entries(nodesBySubject).map(([subName, sNodes]) => {
            const sc = subjectColor(subName);
            const done = (sNodes as any[]).filter((n: any) => n.node_status === 'completed').length;
            return (
              <div key={subName} style={{ marginBottom: 14, padding: 16, borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: `1px solid ${sc}25`, borderLeft: `3px solid ${sc}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ color: sc, fontWeight: 600, fontSize: '0.88rem' }}>{subName}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>{done}/{(sNodes as any[]).length} done</span>
                </div>
                <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(sNodes as any[]).length > 0 ? (done / (sNodes as any[]).length) * 100 : 0}%`, background: sc, borderRadius: 3, transition: 'width 0.5s ease' }} />
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.68rem', margin: '7px 0 0' }}>
                  ~{Math.round((sNodes as any[]).reduce((s: number, n: any) => s + (n.estimated_hours || 0), 0))}h total
                </p>
              </div>
            );
          })}
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
