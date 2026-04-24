import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Map as MapIcon, Target, BookOpen, BarChart2, RotateCcw, ChevronLeft, ChevronRight, CheckCircle2, Clock, Brain, Trophy, TrendingDown, Zap, Lock, Play, X, TrendingUp, AlertTriangle, ChevronDown, ChevronUp, Calendar as CalendarIcon, Filter, MessageCircle, Headphones } from 'lucide-react';
import TestAnalyticsSection from '../components/TestAnalyticsSection';
import ChapterAnalysisModal from '../components/ChapterAnalysisModal';
import RichText from '../components/RichText';
import MindmapVisualizer from '../components/MindmapVisualizer';
import SketchpadVisualizer from '../components/SketchpadVisualizer';

const API = 'http://127.0.0.1:8002/api/v1';
const USER = 'user_123';
const SUBJECT_COLORS: Record<string,string> = { physics:'#6366f1', chemistry:'#10b981', botany:'#84cc16', zoology:'#f59e0b' };

const fetchCurriculumData = async (goal: string = 'neet') => {
  try {
    const r = await axios.get(`${API}/graph/curriculum?curriculum=${goal}`);
    return r.data || [];
  } catch (err) {
    console.error("Failed to fetch curriculum:", err);
    return [];
  }
};

type Tab = 'plan'|'practice'|'learn'|'analyze'|'revise';

const TABS = [
  { id:'plan' as Tab, label:'Plan', icon:MapIcon, active:true },
  { id:'practice' as Tab, label:'Practice', icon:Target, active:true },
  { id:'learn' as Tab, label:'Learn', icon:BookOpen, active:true },
  { id:'analyze' as Tab, label:'Analyze', icon:BarChart2, active:true },
  { id:'revise' as Tab, label:'Revise', icon:RotateCcw, active:true },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>((searchParams.get('tab') as Tab) || 'plan');

  const [journey, setJourney] = useState<any>(null);
  const [nodes, setNodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [weeklyStats, setWeeklyStats] = useState<any>(null);
  const [recentCompletions, setRecentCompletions] = useState<any[]>([]);
  const [weakTopics, setWeakTopics] = useState<any[]>([]);
  const [topicMetrics, setTopicMetrics] = useState<any[]>([]);
  const [curriculum, setCurriculum] = useState<any[]>([]);
  
  // Lifted state for calendar filtering
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    // 1. Fetch Journey & Nodes
    axios.get(`${API}/journey/list/${USER}`).then(r => {
      const journeys = r.data || [];
      if (journeys.length > 0) {
        const j = journeys[0];
        setJourney(j);
        return axios.get(`${API}/journey/${j.id}`).then(res => ({ j, res }));
      }
    }).then((data: any) => {
      if (data && data.res && data.res.data.nodes) {
        const { j, res } = data;
        const start = j?.created_at ? new Date(j.created_at) : new Date();
        const processedNodes = res.data.nodes.map((n: any, idx: number) => {
          const daysToAdd = Math.floor(idx / 2);
          const d = new Date(start);
          d.setDate(d.getDate() + daysToAdd);
          return {
            ...n,
            planned_date: d.toISOString().split('T')[0]
          };
        });
        setNodes(processedNodes);
      }
    }).catch(() => {});

    // 2. Fetch Stats & Metrics
    Promise.all([
      axios.get(`${API}/dashboard/${USER}/weekly-activity`),
      axios.get(`${API}/dashboard/${USER}/recent-completions`),
      axios.get(`${API}/test/user/${USER}/weak-topics`),
      axios.get(`${API}/dashboard/${USER}/topic-metrics`),
      fetchCurriculumData('neet')
    ]).then(([weekly, recent, weak, metrics, curr]) => {
      setWeeklyStats(weekly.data);
      setRecentCompletions(recent.data.completions || []);
      setWeakTopics(weak.data.weak_topics || []);
      setTopicMetrics(metrics.data.topics || []);
      setCurriculum(curr);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const done = useMemo(() => {
    // 1. Get IDs of topics with 100% completion from metrics
    const metricCompletedIds = new Set(
      topicMetrics
        .filter(m => m.completion_percentage === 100)
        .map(m => String(m.topic_id))
    );
    
    // 2. Count a node as done if its node_status is 'completed' OR it has 100% in metrics
    return nodes.filter(n => 
      n.node_status === 'completed' || metricCompletedIds.has(String(n.topic_id))
    ).length;
  }, [nodes, topicMetrics]);

  const pct = nodes.length > 0 ? Math.round((done / nodes.length) * 100) : 0;

  if (loading) return <Loading text="Syncing your progress..." />;

  return (
    <div style={{ minHeight: '100vh', background: '#020617', fontFamily: 'Inter,system-ui,sans-serif', color: 'white' }}>
      {/* Top nav bar */}
      <header style={{ background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0 32px', position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 72 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <img src="https://yolearn-assets.s3.us-west-2.amazonaws.com/yo.png" alt="YoLearn" style={{ height: 32 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '1.5rem', fontWeight: 900, color: 'white' }}>YoLearn.ai</span>
          </div>
        </div>

        <nav style={{ display: 'flex', gap: 4 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => {
              if (t.active) {
                setTab(t.id);
                navigate(`?tab=${t.id}`, { replace: true });
              }
            }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '24px 20px', border: 'none', background: 'none', cursor: t.active ? 'pointer' : 'default',
                color: tab === t.id ? '#6366f1' : t.active ? '#94a3b8' : '#334155',
                borderBottom: tab === t.id ? '2px solid #6366f1' : '2px solid transparent',
                fontWeight: 700, fontSize: '0.875rem', transition: 'all 0.2s', whiteSpace: 'nowrap'
              }}>
              <t.icon size={16} />
              {t.label}
              {!t.active && <Lock size={11} style={{ opacity: 0.5 }} />}
            </button>
          ))}
        </nav>

        <div style={{ padding: '8px 16px', borderRadius: 8, background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)', fontSize: '0.8rem', color: '#a5b4fc', fontWeight: 700 }}>
          Srijan · NEET 2025
        </div>
      </header>

      <main style={{ padding: '32px', maxWidth: 1240, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: (tab === 'plan' || tab === 'learn') ? '1fr 340px' : '1fr', gap: 32, alignItems: 'start' }}>
          {/* Main Content Area */}
          <div style={{ minWidth: 0 }}>
            {tab === 'plan' && <PlanTab journey={journey} nodes={nodes} done={done} pct={pct} weakTopics={weakTopics} setTab={setTab} selectedDate={selectedDate} setSelectedDate={setSelectedDate} />}
            {tab === 'learn' && <LearnTab curriculum={curriculum} topicMetrics={topicMetrics} weakTopics={weakTopics} nodes={nodes} selectedDate={selectedDate} setSelectedDate={setSelectedDate} />}
            {tab === 'practice' && <PracticeTab />}
            {tab === 'analyze' && <AnalyzeTab />}
            {tab === 'revise' && <ReviseTab />}
          </div>

          {/* Persistent Sidebar for Plan and Learn tabs */}
          {(tab === 'plan' || tab === 'learn') && (
            <DashboardSidebar 
              journey={journey} 
              weeklyStats={weeklyStats} 
              recentCompletions={recentCompletions}
              nodes={nodes}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
            />
          )}
        </div>
      </main>
      <GlobalStyles />
    </div>
  );
}

/** Shared Sidebar Component **/
function DashboardSidebar({ journey, weeklyStats, recentCompletions, nodes, selectedDate, setSelectedDate }: any) {
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const monthName = currentMonth.toLocaleString('default', { month: 'long' });

  const agendaForSelectedDay = useMemo(() => {
    if (!selectedDate) return [];
    return nodes?.filter((n: any) => n.planned_date === selectedDate) || [];
  }, [nodes, selectedDate]);

  return (
    <aside style={{ 
      display: 'flex', flexDirection: 'column', gap: 24, position: 'sticky', top: 100, 
      maxHeight: 'calc(100vh - 140px)', overflowY: 'auto', paddingRight: 8, scrollbarWidth: 'thin' 
    }}>
      {/* Goal Brief */}
      <div style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: 24, padding: 24, border: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Current Goal</div>
            <div style={{ fontWeight: 700, color: 'white' }}>{journey?.goal || 'No goal set'}</div>
          </div>
          <button style={{ padding: 8, borderRadius: 8, background: 'rgba(59, 130, 246, 0.1)', border: 'none', color: '#3b82f6' }}><Zap size={16} /></button>
        </div>
        <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 16 }}>
          Exam Year<br />
          <span style={{ color: 'white', fontWeight: 600 }}>May 2027</span>
        </div>
        <button onClick={() => navigate('/onboarding')} style={{ background: 'none', border: 'none', color: '#2dd4bf', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}>Change Goal →</button>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: 20, padding: 16, border: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ color: '#ef4444' }}><TrendingUp size={20} /></div>
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{weeklyStats?.current_streak || 0} days</div>
            <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Current Streak</div>
          </div>
        </div>
        <div style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: 20, padding: 16, border: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ color: '#3b82f6' }}><Clock size={20} /></div>
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{weeklyStats?.total_weekly_hours || 0}h</div>
            <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Study this week</div>
          </div>
        </div>
      </div>

      {/* Full Calendar Widget */}
      <div style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: 24, padding: 20, border: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0 }}>{monthName} {year}</h3>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={prevMonth} style={{ padding: 4, borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><ChevronLeft size={14}/></button>
            <button onClick={nextMonth} style={{ padding: 4, borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><ChevronRight size={14}/></button>
          </div>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 8 }}>
          {['S','M','T','W','T','F','S'].map((d, i) => (
            <div key={`${d}-${i}`} style={{ textAlign: 'center', fontSize: '0.6rem', color: '#475569', fontWeight: 700 }}>{d}</div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {Array.from({ length: firstDayOfMonth(year, month) }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {Array.from({ length: daysInMonth(year, month) }).map((_, i) => {
            const d = i + 1;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const studyMins = weeklyStats?.daily_minutes?.[dateStr] || 0;
            const isToday = new Date().toDateString() === new Date(year, month, d).toDateString();
            const hasDeadline = nodes?.some((n: any) => n.planned_date === dateStr && n.status !== 'completed');
            const isSelected = selectedDate === dateStr;
            
            return (
              <div key={d} 
                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                style={{ 
                  aspectRatio: '1', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
                  background: isToday ? '#6366f1' : (isSelected ? 'rgba(99, 102, 241, 0.4)' : (studyMins > 0 ? `rgba(99, 102, 241, ${Math.min(0.1 + studyMins/60, 0.4)})` : 'transparent')),
                  color: isToday ? 'white' : (studyMins > 0 || isSelected ? '#a5b4fc' : '#64748b'),
                  position: 'relative',
                  border: isSelected ? '2px solid #6366f1' : (hasDeadline ? '1px solid rgba(239, 68, 68, 0.3)' : 'none'),
                  transition: 'all 0.2s'
                }}>
                {d}
                {hasDeadline && <div style={{ position:'absolute', bottom:2, width:3, height:3, borderRadius:'50%', background:'#ef4444' }} />}
              </div>
            );
          })}
        </div>

        {/* Agenda for Selected Day */}
        {selectedDate && (
          <div style={{ marginTop: 20, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Agenda: {new Date(selectedDate).toLocaleDateString(undefined, { day:'numeric', month:'short' })}</div>
              <button onClick={() => setSelectedDate(null)} style={{ background:'none', border:'none', color:'#475569', cursor:'pointer' }}><X size={14}/></button>
            </div>
            {agendaForSelectedDay.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {agendaForSelectedDay.map((item: any, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 14, height: 14, borderRadius: 4, background: item.status === 'completed' ? '#10b981' : '#f59e0b', marginTop: 2, flexShrink: 0 }} />
                    <div style={{ fontSize: '0.75rem', color: 'white', lineHeight: 1.4 }}>{item.topic_name}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '0.75rem', color: '#475569' }}>No topics planned for this day. Click dates to filter main view.</div>
            )}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: 24, padding: 24, border: '1px solid rgba(255,255,255,0.05)' }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 20 }}>Recent Activity</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {recentCompletions.length > 0 ? recentCompletions.map((c: any, i: number) => (
            <div key={i} style={{ display: 'flex', gap: 12 }}>
               <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                 <CheckCircle2 size={16} color="#10b981" />
               </div>
               <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'white', lineHeight: 1.2 }}>{c.subtopic_name}</div>
                  <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: 4 }}>Completed • {new Date(c.completed_at).toLocaleDateString()}</div>
               </div>
            </div>
          )) : (
            <div style={{ fontSize: '0.75rem', color: '#475569' }}>No recent activity.</div>
          )}
        </div>
      </div>
    </aside>
  );
}

function PlanTab({ journey, nodes, done, pct, weakTopics, setTab, selectedDate, setSelectedDate }: any) {
  const navigate = useNavigate();

  if (!journey) return (
    <Empty icon={MapIcon} title="No Learning Plan Yet" desc="Generate a personalized study roadmap tailored to your exam date and pace.">
      <button onClick={() => navigate('/onboarding')} className="btn-primary-small">Create Learning Plan →</button>
    </Empty>
  );

  const filteredByDate = selectedDate ? nodes.filter((n: any) => n.planned_date === selectedDate) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: 8 }}>Welcome Srijan</div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: '0 0 16px 0' }}>{selectedDate ? `Plan for ${new Date(selectedDate).toLocaleDateString(undefined, { day:'numeric', month:'short' })}` : 'Continue Your Preparation'}</h1>
          <p style={{ color: '#64748b', fontSize: '1rem', margin: 0 }}>{selectedDate ? 'Focus on today\'s goals to stay on track' : 'Pick up where you left off and stay consistent'}</p>
        </div>
        {selectedDate && (
          <button onClick={() => setSelectedDate(null)} style={{ padding: '8px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#94a3b8', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display:'flex', alignItems:'center', gap:6 }}>
            <X size={14}/> Clear Date
          </button>
        )}
      </div>

      {selectedDate ? (
        <section>
          {filteredByDate.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
               {filteredByDate.map((node: any, i: number) => (
                 <div key={i} style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: 20, padding: 24, border: '1px solid rgba(255,255,255,0.05)', position:'relative' }}>
                    {node.status === 'completed' && <CheckCircle2 size={18} color="#10b981" style={{ position:'absolute', top:24, right:24 }} />}
                    <h4 style={{ margin: '0 0 4px 0', color: 'white', fontSize: '1rem', paddingRight: 30 }}>{node.topic_name}</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: '0.8rem', marginBottom: 20 }}>
                       <span style={{ display:'flex', alignItems:'center', gap:4 }}><div style={{ width:8, height:8, borderRadius:'50%', background:SUBJECT_COLORS[node.subject_name.toLowerCase()] || '#818cf8' }}></div> {node.subject_name}</span>
                    </div>
                    <button onClick={async () => {
                      try {
                        const r = await axios.get(`${API}/graph/topic/${node.topic_id}`);
                        const cid = r.data.chapter_id;
                        navigate(`/learning/chapter/${cid}/graph?topicId=${node.topic_id}&autoStudy=1`);
                      } catch {
                        navigate(`/learning/${node.topic_id}`);
                      }
                    }} style={{ width: '100%', padding: '10px', borderRadius: 12, border: 'none', background: 'white', color: 'black', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                       <Play size={14} fill="black" /> {node.status === 'completed' ? 'Review' : 'Start Study'}
                    </button>
                 </div>
               ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 60, background: 'rgba(255,255,255,0.02)', borderRadius: 24, border: '1px dashed rgba(255,255,255,0.1)' }}>
               <CalendarIcon size={32} color="#334155" style={{ marginBottom: 16 }} />
               <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#94a3b8' }}>No topics planned for this date</h3>
               <p style={{ color: '#475569', fontSize: '0.875rem' }}>Use the Learn tab to find topics and add them to your schedule.</p>
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Large Progress Card */}
          <div style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81)', borderRadius: 24, padding: 32, border: '1px solid rgba(255,255,255,0.05)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'relative', zIndex: 2 }}>
              <div style={{ fontSize: '0.8rem', color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Current Goal</div>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'white', margin: '0 0 4px 0' }}>{journey.goal}</h2>
              <div style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: 24 }}>{done}/{nodes.length} Topics Completed</div>

              <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 12, height: 12, overflow: 'hidden', marginBottom: 12 }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'white', borderRadius: 12, transition: 'width 1s ease-out' }}></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.875rem', color: '#a5b4fc', fontWeight: 600 }}>Progress</span>
                <span style={{ fontSize: '0.875rem', color: 'white', fontWeight: 700 }}>{pct}%</span>
              </div>
            </div>
            <button onClick={() => { setTab('analyze'); navigate(`?tab=analyze`); }} style={{ position: 'absolute', top: 32, right: 32, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '10px 20px', borderRadius: 12, fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', zIndex: 10 }}>
              View Progress
            </button>
          </div>

          <section>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin:0 }}>Continue where you left</h3>
              <div style={{ display:'flex', gap:8 }}>
                 <button onClick={() => { const el = document.getElementById('continue-scroll'); if(el) el.scrollBy({ left: -300, behavior: 'smooth' }) }} style={{ width:32, height:32, borderRadius:'50%', border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.05)', color:'white', cursor:'pointer' }}>←</button>
                 <button onClick={() => { const el = document.getElementById('continue-scroll'); if(el) el.scrollBy({ left: 300, behavior: 'smooth' }) }} style={{ width:32, height:32, borderRadius:'50%', border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.05)', color:'white', cursor:'pointer' }}>→</button>
              </div>
            </div>
            <div id="continue-scroll" style={{ display: 'flex', gap: 16, overflowX: 'auto', scrollBehavior: 'smooth', paddingBottom: 8, scrollbarWidth: 'none' }}>
               {nodes.filter((n: any) => n.status !== 'completed').slice(0, 5).map((node: any, i: number) => (
                 <div key={i} style={{ width: 300, flexShrink: 0, background: 'rgba(30, 41, 59, 0.4)', borderRadius: 20, padding: 24, border: '1px solid rgba(255,255,255,0.05)' }}>
                    <h4 style={{ margin: '0 0 4px 0', color: 'white', fontSize: '1rem', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{node.topic_name}</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: '0.8rem', marginBottom: 20 }}>
                       <span style={{ display:'flex', alignItems:'center', gap:4 }}><div style={{ width:8, height:8, borderRadius:'50%', background:SUBJECT_COLORS[node.subject_name.toLowerCase()] || '#818cf8' }}></div> {node.subject_name}</span>
                    </div>
                    <button onClick={async () => {
                      try {
                        const r = await axios.get(`${API}/graph/topic/${node.topic_id}`);
                        const cid = r.data.chapter_id;
                        navigate(`/learning/chapter/${cid}/graph?topicId=${node.topic_id}&autoStudy=1`);
                      } catch {
                        navigate(`/learning/${node.topic_id}`);
                      }
                    }} style={{ width: '100%', padding: '10px', borderRadius: 12, border: 'none', background: 'white', color: 'black', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                       <Play size={14} fill="black" /> Resume
                    </button>
                 </div>
               ))}
            </div>
          </section>

          <section>
             <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 20, display:'flex', alignItems:'center', gap:8 }}><Zap size={18} color="#2dd4bf"/> Suggested for you</h3>
             <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'flex-start' }}>
                {weakTopics && weakTopics.length > 0 ? (
                  weakTopics.slice(0, 3).map((w: any, i: number) => (
                    <div key={i} style={{ width: 300, background: 'rgba(239, 68, 68, 0.05)', borderRadius: 20, padding: 20, border: '1px solid rgba(239, 68, 68, 0.1)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                         <div style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 700, textTransform: 'uppercase' }}>Weak Area</div>
                         <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{w.error_rate}% error rate</div>
                      </div>
                      <h4 style={{ margin: '0 0 16px 0', color: 'white', fontSize: '0.95rem' }}>{w.chapter_name}</h4>
                      <button onClick={() => navigate(`/test?prefill_type=practice_drill&prefill_chapter=${w.chapter}&prefill_subject=${w.subject}`)} style={{ width: '100%', padding: '8px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.1)', color: '#fca5a5', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                         Take Remedial Test
                      </button>
                    </div>
                  ))
                ) : (
                  <div style={{ width: '100%', height: 160, borderRadius: 20, border: '2px dashed rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
                     No weak areas detected yet. Keep practicing!
                  </div>
                )}
             </div>
          </section>
        </>
      )}
    </div>
  );
}

function PracticeTab() {
  const navigate = useNavigate();
  const TEST_CARDS = [
    { type:'topic_quiz', label:'Topic Quiz', desc:'10–30 Qs on one chapter', icon:Zap, color:'#6366f1', time:'30 min' },
    { type:'chapter_mock', label:'Chapter Mock', desc:'Full chapter, all topics', icon:BookOpen, color:'#10b981', time:'45 min' },
    { type:'full_mock', label:'Full NEET Mock', desc:'180 Qs · NEET standard', icon:Trophy, color:'#f59e0b', time:'3h 20m' },
    { type:'practice_drill', label:'Targeted Drill', desc:'AI picks your weak spots', icon:Target, color:'#ec4899', time:'Flexible' },
  ];
  return (
    <div>
      <h1 style={{ fontSize:'1.75rem', fontWeight:900, marginBottom:8 }}>Test Center</h1>
      <p style={{ color:'#64748b', marginBottom:32 }}>Choose your test format. AI adapts questions to your weak areas.</p>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:20, marginBottom:40 }}>
        {TEST_CARDS.map(c => (
          <button key={c.type} onClick={() => {
            const params = new URLSearchParams();
            params.set('prefill_type', c.type);
            navigate(`/test?${params.toString()}`, { state:{ prefill:{ type:c.type } } });
          }}
            style={{ padding:28, borderRadius:20, border:`1px solid ${c.color}30`, background:`${c.color}08`, cursor:'pointer', textAlign:'left', transition:'all 0.2s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform='translateY(-4px)'; (e.currentTarget as HTMLElement).style.boxShadow=`0 12px 30px ${c.color}20`; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform=''; (e.currentTarget as HTMLElement).style.boxShadow=''; }}>
            <div style={{ width:48, height:48, borderRadius:14, background:`${c.color}20`, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}>
              <c.icon size={22} color={c.color} />
            </div>
            <div style={{ fontWeight:800, fontSize:'1rem', color:'white', marginBottom:6 }}>{c.label}</div>
            <div style={{ color:'#64748b', fontSize:'0.85rem', marginBottom:12 }}>{c.desc}</div>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <Clock size={12} color={c.color} />
              <span style={{ color:c.color, fontSize:'0.78rem', fontWeight:700 }}>{c.time}</span>
            </div>
          </button>
        ))}
      </div>
      <h2 style={{ fontSize:'1rem', fontWeight:700, marginBottom:16, color:'#94a3b8' }}>RECENT TESTS</h2>
      <TestAnalyticsSection userId={USER} />
    </div>
  );
}

const STATUS_FILTERS = [
  { id: 'all', label: 'All', icon: BookOpen },
  { id: 'completed', label: 'Completed', icon: CheckCircle2, color: '#10b981' },
  { id: 'in_progress', label: 'In Progress', icon: TrendingUp, color: '#f59e0b' },
  { id: 'weak', label: 'Weak Areas', icon: AlertTriangle, color: '#ef4444' },
  { id: 'overdue', label: 'Overdue', icon: Clock, color: '#ec4899' },
  { id: 'no_quiz', label: 'Missing Quiz', icon: Zap, color: '#8b5cf6' },
];

function LearnTab({ curriculum, topicMetrics, weakTopics, nodes, selectedDate, setSelectedDate }: any) {
  const navigate = useNavigate();
  const [classFilter, setClassFilter] = useState<'all'|'11'|'12'>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  
  const [showAllTutorInsights, setShowAllTutorInsights] = useState(false);
  const [showAllTestInsights, setShowAllTestInsights] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const filteredCurriculum = useMemo(() => {
    return curriculum.map((curr: any) => ({
      ...curr,
      subjects: (curr.subjects || []).map((subj: any) => {
        let chapters = subj.chapters || [];
        
        // Apply class filter
        if (classFilter !== 'all') {
          chapters = chapters.filter((ch: any) => String(ch.class_level) === classFilter);
        }

        // Apply status filter
        if (statusFilter !== 'all') {
          chapters = chapters.filter((ch: any) => {
            const chNameLower = ch.name?.toLowerCase() || '';
            const chIdStr = String(ch.id);
            
            const isWeak = weakTopics.some((w: any) => w.chapter_name?.toLowerCase() === chNameLower || w.chapter_id === chIdStr);
            const metric = topicMetrics.find((t: any) => t.topic_id === chIdStr || t.topic_name?.toLowerCase().includes(chNameLower.slice(0, 10)));
            const node = nodes?.find((n: any) => n.chapter_id === chIdStr || n.chapter_name?.toLowerCase() === chNameLower);
            
            const isOverdue = node && node.planned_date < today && node.node_status !== 'completed';
            const isCompleted = metric?.completion_percentage === 100;
            const isInProgress = metric?.completion_percentage > 0 && metric?.completion_percentage < 100;

            if (statusFilter === 'completed') return isCompleted;
            if (statusFilter === 'in_progress') return isInProgress;
            if (statusFilter === 'weak') return isWeak;
            if (statusFilter === 'overdue') return isOverdue;
            if (statusFilter === 'no_quiz') return isCompleted && (!metric?.test_count || metric.test_count === 0);
            return true;
          });
        }

        // Apply Date filter if active
        if (selectedDate) {
          chapters = chapters.filter((ch: any) => {
            const chIdStr = String(ch.id);
            const chNameLower = ch.name?.toLowerCase() || '';
            return nodes?.some((n: any) => 
              n.planned_date === selectedDate && 
              (n.chapter_id === chIdStr || n.chapter_name?.toLowerCase() === chNameLower)
            );
          });
        }

        return { ...subj, chapters };
      }).filter((subj: any) => subj.chapters.length > 0)
    })).filter((curr: any) => curr.subjects.length > 0);
  }, [curriculum, classFilter, statusFilter, weakTopics, topicMetrics, nodes, today, selectedDate]);

  if (!curriculum || curriculum.length === 0) return <Empty icon={BookOpen} title="No Curriculum Found" desc="Check your exam selection." />;

  return (
    <div>
      <div key="learn-header" style={{ display:'flex', flexDirection: 'column', gap: 24, marginBottom: 32 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <h1 style={{ fontSize:'1.75rem', fontWeight:900, margin:0 }}>{selectedDate ? `Topics for ${new Date(selectedDate).toLocaleDateString(undefined, { day:'numeric', month:'short' })}` : 'Learning Agent'}</h1>
            <p style={{ color:'#64748b', margin:'4px 0 0', fontSize:'0.875rem' }}>{selectedDate ? 'Showing curriculum planned for this date.' : 'Personalized curriculum based on your goal.'}</p>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {selectedDate && (
              <button onClick={() => setSelectedDate(null)} style={{ padding: '7px 16px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}>
                Clear Date Filter
              </button>
            )}
            {(['all','11','12'] as const).map(cls => (
              <button key={cls} onClick={()=>setClassFilter(cls)}
                style={{ padding:'7px 16px', borderRadius:20, border:'none', cursor:'pointer', fontWeight:700, fontSize:'0.8rem',
                  background: classFilter===cls ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'rgba(255,255,255,0.06)',
                  color: classFilter===cls ? 'white' : '#94a3b8' }}>
                {cls === 'all' ? 'All Classes' : `Class ${cls}`}
              </button>
            ))}
          </div>
        </div>

        {/* Status Filter Bar */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'none' }}>
           {STATUS_FILTERS.map(f => (
             <button key={f.id} onClick={() => setStatusFilter(f.id)}
               style={{ 
                 display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', 
                 background: statusFilter === f.id ? (f.color ? `${f.color}20` : 'rgba(255,255,255,0.1)') : 'rgba(255,255,255,0.02)',
                 color: statusFilter === f.id ? (f.color || 'white') : '#64748b',
                 fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap'
               }}>
               <f.icon size={14} />
               {f.label}
             </button>
           ))}
        </div>
      </div>

      {/* Two-section insight row (hide if date filter active to reduce noise) */}
      {!selectedDate && (
        <div key="learn-insights" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:32 }}>
          {/* Tutor Insights */}
          <div style={{ padding:16, borderRadius:14, background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.2)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
              <Brain size={14} color="#6366f1" />
              <span style={{ fontWeight:700, fontSize:'0.8rem', color:'#a5b4fc' }}>Tutor Insights</span>
            </div>
            {topicMetrics.length > 0 ? (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {topicMetrics.slice(0, showAllTutorInsights ? undefined : 3).map((t:any,i:number) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ flex:1, height:4, background:'rgba(255,255,255,0.06)', borderRadius:4, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${t.completion_percentage}%`, background:'#6366f1', borderRadius:4 }} />
                    </div>
                    <span style={{ fontSize:'0.72rem', color:'#94a3b8', minWidth:80, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.topic_name}</span>
                    <span style={{ fontSize:'0.72rem', color:'#818cf8', fontWeight:700, minWidth:30 }}>{t.completion_percentage}%</span>
                  </div>
                ))}
                {topicMetrics.length > 3 && (
                  <button onClick={() => setShowAllTutorInsights(!showAllTutorInsights)} style={{ background:'none', border:'none', fontSize:'0.7rem', color:'#818cf8', cursor:'pointer', textAlign:'left', padding:0, marginTop:4, display:'flex', alignItems:'center', gap:4 }}>
                    {showAllTutorInsights ? <><ChevronUp size={12}/> Show less</> : <><ChevronDown size={12}/> +{topicMetrics.length-3} more topics tracked</>}
                  </button>
                )}
              </div>
            ) : <div style={{ color:'#475569', fontSize:'0.8rem' }}>Start studying to see tutor insights.</div>}
          </div>

          {/* Test Insights */}
          <div style={{ padding:16, borderRadius:14, background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.15)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
              <AlertTriangle size={14} color="#ef4444" />
              <span style={{ fontWeight:700, fontSize:'0.8rem', color:'#fca5a5' }}>Test Insights — Weak Topics</span>
            </div>
            {weakTopics.length > 0 ? (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {weakTopics.slice(0, showAllTestInsights ? undefined : 3).map((w:any,i:number) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontSize:'0.8rem', color:'#fca5a5', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{w.chapter_name}</span>
                    <span style={{ fontSize:'0.72rem', color:'#ef4444', fontWeight:700, marginLeft:8 }}>{w.error_rate}% err</span>
                  </div>
                ))}
                {weakTopics.length > 3 && (
                  <button onClick={() => setShowAllTestInsights(!showAllTestInsights)} style={{ background:'none', border:'none', fontSize:'0.7rem', color:'#ef4444', cursor:'pointer', textAlign:'left', padding:0, marginTop:4, display:'flex', alignItems:'center', gap:4 }}>
                    {showAllTestInsights ? <><ChevronUp size={12}/> Show less</> : <><ChevronDown size={12}/> +{weakTopics.length-3} more weak chapters</>}
                  </button>
                )}
              </div>
            ) : <div style={{ color:'#475569', fontSize:'0.8rem' }}>Take a test to see weak topic insights.</div>}
          </div>
        </div>
      )}

      {/* Daily Agenda Section (if date selected) */}
      {selectedDate && (
        <section style={{ marginBottom: 40 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
             <CalendarIcon size={18} color="#6366f1" />
             <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>Daily Goals — {new Date(selectedDate).toLocaleDateString(undefined, { day:'numeric', month:'short' })}</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
             {nodes.filter((n: any) => n.planned_date === selectedDate).map((node: any, i: number) => (
                <div key={i} style={{ background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.6), rgba(15, 23, 42, 0.6))', borderRadius: 20, padding: 24, border: '1px solid rgba(99, 102, 241, 0.2)', position:'relative', display:'flex', flexDirection:'column', gap:12 }}>
                   <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                      <span style={{ fontSize:'0.7rem', color:'#6366f1', fontWeight:800, textTransform:'uppercase' }}>Target Topic</span>
                      {node.node_status === 'completed' && <CheckCircle2 size={16} color="#10b981" />}
                   </div>
                   <h4 style={{ margin: 0, color: 'white', fontSize: '1rem', fontWeight: 700 }}>{node.topic_name}</h4>
                   <div style={{ display:'flex', alignItems:'center', gap:6, color:'#64748b', fontSize:'0.75rem' }}>
                      <BookOpen size={12} /> {node.chapter_name || 'General'}
                   </div>
                   <button onClick={async () => {
                      try {
                        const r = await axios.get(`${API}/graph/topic/${node.topic_id}`);
                        navigate(`/learning/chapter/${r.data.chapter_id}/graph?topicId=${node.topic_id}&autoStudy=1`);
                      } catch {
                        navigate(`/learning/${node.topic_id}`);
                      }
                    }} style={{ marginTop:8, padding: '10px', borderRadius: 12, border: 'none', background: 'white', color: 'black', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Play size={12} fill="black" /> {node.node_status === 'completed' ? 'Review' : 'Start Now'}
                   </button>
                </div>
             ))}
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '40px 0' }} />
        </section>
      )}

      {/* Chapter grid */}
      {filteredCurriculum.length > 0 ? filteredCurriculum.map((curr: any) => (
        <div key={curr.id}>
          {(curr.subjects || []).map((subj: any) => {
            const color = SUBJECT_COLORS[subj.name?.toLowerCase()] || '#6366f1';
            const chapters = subj.chapters || [];
            
            return (
              <div key={subj.id} style={{ marginBottom:40 }}>
                <div key="subj-header" style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', background:color }} />
                  <h2 style={{ margin:0, fontSize:'1.1rem', fontWeight:800, color:'white' }}>{subj.name}</h2>
                  <span style={{ fontSize:'0.72rem', color, background:`${color}15`, padding:'2px 8px', borderRadius:20, fontWeight:600 }}>{chapters.length} filtered</span>
                </div>
                
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:12 }}>
                  {chapters.map((ch: any) => {
                    const isWeak = weakTopics.some((w:any) => w.chapter_name?.toLowerCase() === ch.name?.toLowerCase());
                    const metric = topicMetrics.find((t:any) => t.topic_name?.toLowerCase().includes(ch.name?.toLowerCase().slice(0,10)));
                    const node = nodes?.find((n:any) => n.topic_name?.toLowerCase().includes(ch.name?.toLowerCase().slice(0,10)));
                    const isOverdue = node && node.planned_date < today && node.status !== 'completed';
                    const isCompleted = metric?.completion_percentage === 100;
                    const missingQuiz = isCompleted && (!metric?.test_count || metric.test_count === 0);

                    return (
                      <button key={ch.id}
                        onClick={() => navigate(`/learning/chapter/${ch.id}/graph`)}
                        style={{ 
                          padding:'16px', borderRadius:16, border:`1px solid ${isWeak ? 'rgba(239,68,68,0.3)' : isOverdue ? 'rgba(236,72,153,0.3)' : `${color}20`}`, 
                          background:isWeak?'rgba(239,68,68,0.04)':isOverdue?'rgba(236,72,153,0.04)':`${color}05`, 
                          cursor:'pointer', textAlign:'left', transition:'all 0.2s', display:'flex', flexDirection:'column', gap:10 
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform='translateY(-2px)'; (e.currentTarget as HTMLElement).style.background = isWeak?'rgba(239,68,68,0.08)':isOverdue?'rgba(236,72,153,0.08)':`${color}08`; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform=''; (e.currentTarget as HTMLElement).style.background = isWeak?'rgba(239,68,68,0.04)':isOverdue?'rgba(236,72,153,0.04)':`${color}05`; }}>
                        
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                          <span style={{ fontWeight:700, fontSize:'0.85rem', color:'white', lineHeight:1.4 }}>{ch.name}</span>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {isWeak && <AlertTriangle size={12} color="#ef4444" />}
                            {isOverdue && <Clock size={12} color="#ec4899" />}
                            {missingQuiz && <Zap size={12} color="#8b5cf6" />}
                            {isCompleted && <CheckCircle2 size={12} color="#10b981" />}
                          </div>
                        </div>

                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop: 'auto' }}>
                          <span style={{ fontSize:'0.65rem', color:'#475569', fontWeight: 600 }}>{(ch.topics||[]).length} Topics</span>
                          <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Play size={10} color={color} fill={color} />
                          </div>
                        </div>

                        {metric && (
                          <div style={{ height:3, background:'rgba(255,255,255,0.05)', borderRadius:3, overflow:'hidden' }}>
                            <div style={{ height:'100%', width:`${metric.completion_percentage}%`, background: isCompleted ? '#10b981' : color }} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )) : (
        <div style={{ textAlign: 'center', padding: 60, background: 'rgba(255,255,255,0.02)', borderRadius: 24, border: '1px dashed rgba(255,255,255,0.1)' }}>
          <Filter size={32} color="#334155" style={{ marginBottom: 16 }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#94a3b8' }}>No chapters planned for this date</h3>
          <button onClick={() => { setSelectedDate(null); }} style={{ marginTop: 12, background: 'none', border: 'none', color: '#6366f1', fontWeight: 700, cursor: 'pointer' }}>Show all chapters</button>
        </div>
      )}
    </div>
  );
}

function AnalyzeTab() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [doubts, setDoubts] = useState<any[]>([]);
  const [topicMetrics, setTopicMetrics] = useState<any[]>([]);
  const [chapters, setChapters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [popup, setPopup] = useState<any>(null);
  const [searchParams] = useSearchParams();
  const analyzeChapterId = searchParams.get('analyzeChapter');
  const analyzeChapterName = searchParams.get('analyzeName');

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/dashboard/${USER}/stats`),
      axios.get(`${API}/dashboard/${USER}/topic-metrics`),
      axios.get(`${API}/dashboard/${USER}/chapters`),
    ]).then(([s, m, c]) => {
      setStats(s.data); setTopicMetrics(m.data.topics||[]); setChapters(c.data.chapters||[]);
    }).catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  const fetchDoubts = useCallback(async () => {
    try { const r = await axios.get(`${API}/doubts/${USER}`, { params:{ status: showResolved?'resolved':'active' } }); setDoubts(r.data.doubts||[]); } catch {}
  }, [showResolved]);
  useEffect(() => { fetchDoubts(); }, [fetchDoubts]);

  if (loading) return <Loading text="Loading analytics..." />;

  const prog = stats?.progress_summary || {};

  const openPopup = (type: string) => {
    if (type === 'study_time') setPopup({ type, data: stats?.subject_time || {} });
    else if (type === 'mastered') setPopup({ type, data: topicMetrics.filter((t:any) => t.completion_percentage >= 70) });
    else if (type === 'in_progress') setPopup({ type, data: topicMetrics.filter((t:any) => t.completion_percentage > 0 && t.completion_percentage < 70) });
    else if (type === 'doubts') setPopup({ type, data: doubts.filter((d:any) => d.status === 'active') });
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
      <h1 style={{ fontSize:'1.75rem', fontWeight:900, margin:0 }}>Performance Analytics</h1>

      {/* Summary Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:14 }}>
        {[
          { label:'Study Time', val:`${stats?.total_time_spent_minutes||0} min`, icon:Clock, color:'#6366f1', key:'study_time' },
          { label:'Mastered', val:prog.completed||0, icon:Trophy, color:'#10b981', key:'mastered' },
          { label:'In Progress', val:prog.in_progress||0, icon:TrendingDown, color:'#f59e0b', key:'in_progress' },
          { label:'Active Doubts', val:doubts.filter((d:any)=>d.status==='active').length, icon:Brain, color:'#8b5cf6', key:'doubts' },
        ].map(s => (
          <button key={s.label} onClick={() => openPopup(s.key)}
            style={{ padding:18, borderRadius:16, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', display:'flex', alignItems:'center', gap:14, cursor:'pointer', transition:'all 0.2s', textAlign:'left' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${s.color}40`; (e.currentTarget as HTMLElement).style.background = `${s.color}08`; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}>
            <div style={{ background:`${s.color}20`, padding:10, borderRadius:10, color:s.color, flexShrink:0 }}><s.icon size={20}/></div>
            <div>
              <div style={{ fontSize:'0.72rem', color:'#64748b' }}>{s.label}</div>
              <div style={{ fontSize:'1.5rem', fontWeight:700, color:s.color }}>{String(s.val)}</div>
              <div style={{ fontSize:'0.65rem', color:'#334155', marginTop:2 }}>tap for details</div>
            </div>
          </button>
        ))}
      </div>

      {/* Stat popup modal */}
      {popup && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 }}
          onClick={() => setPopup(null)}>
          <div style={{ background:'#0f172a', border:'1px solid rgba(255,255,255,0.1)', borderRadius:20, padding:32, maxWidth:520, width:'90%', maxHeight:'70vh', overflowY:'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h2 style={{ margin:0, fontSize:'1.1rem' }}>
                {popup.type === 'study_time' ? '⏱ Study Time Breakdown' :
                 popup.type === 'mastered' ? '🏆 Mastered Topics' :
                 popup.type === 'in_progress' ? '📈 In Progress Topics' : '🧠 Active Doubts'}
              </h2>
              <button onClick={() => setPopup(null)} style={{ background:'none', border:'none', color:'#64748b', cursor:'pointer' }}><X size={20}/></button>
            </div>
            {popup.type === 'study_time' && (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {Object.entries(popup.data).length === 0
                  ? <p style={{ color:'#475569' }}>No study time recorded yet.</p>
                  : Object.entries(popup.data).map(([subj, mins]:any) => (
                    <div key={subj} style={{ display:'flex', justifyContent:'space-between', padding:'10px 14px', borderRadius:10, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)' }}>
                      <span style={{ textTransform:'capitalize', fontWeight:600 }}>{subj}</span>
                      <span style={{ color:'#6366f1', fontWeight:700 }}>{mins} min</span>
                    </div>
                  ))}
              </div>
            )}
            {(popup.type === 'mastered' || popup.type === 'in_progress') && (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {popup.data.length === 0
                  ? <p style={{ color:'#475569' }}>No topics {popup.type === 'mastered' ? 'mastered' : 'in progress'} yet.</p>
                  : popup.data.map((t:any,i:number) => (
                    <div key={i} style={{ padding:'10px 14px', borderRadius:10, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                        <span style={{ fontWeight:600, fontSize:'0.875rem' }}>{t.topic_name}</span>
                        <span style={{ color: t.completion_percentage >= 70 ? '#10b981' : '#f59e0b', fontWeight:700 }}>{t.completion_percentage}%</span>
                      </div>
                      <div style={{ height:4, background:'rgba(255,255,255,0.06)', borderRadius:4, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${t.completion_percentage}%`, background: t.completion_percentage >= 70 ? '#10b981' : '#f59e0b', borderRadius:4 }} />
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
      {/* Chapter analysis */}
      {chapters.length > 0 && (
        <div style={{ padding:24, borderRadius:20, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
          <h3 style={{ margin:'0 0 24px', fontSize:'1rem', fontWeight:800 }}>Chapter-Wise Analysis</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
            {Object.entries(
              chapters.reduce((acc: any, ch: any) => {
                const sub = ch.subject || 'Other';
                if (!acc[sub]) acc[sub] = [];
                acc[sub].push(ch);
                return acc;
              }, {})
            ).map(([subject, subChapters]: [string, any]) => {
              const color = SUBJECT_COLORS[subject.toLowerCase()] || '#6366f1';
              return (
                <div key={subject}>
                   <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                      <div style={{ width:6, height:6, borderRadius:'50%', background:color }} />
                      <div style={{ fontSize:'0.75rem', fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em' }}>{subject}</div>
                   </div>
                   <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                    {subChapters.sort((a:any, b:any) => a.chapter_name.localeCompare(b.chapter_name)).map((ch:any, i:number) => (
                      <button key={i} onClick={() => {
                        const p = new URLSearchParams(window.location.search);
                        p.set('analyzeChapter', ch.chapter || ch.id);
                        p.set('analyzeName', ch.chapter_name);
                        navigate(`?${p.toString()}`, { replace: true });
                      }} 
                        style={{ padding:'8px 16px', borderRadius:12, border:`1px solid ${color}30`, background:`${color}08`, cursor:'pointer', color:'white', fontSize:'0.8rem', fontWeight:600, transition:'all 0.2s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${color}15`; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${color}08`; }}>
                        {ch.chapter_name}
                      </button>
                    ))}
                   </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Test Analytics */}
      <TestAnalyticsSection userId={USER} />

      {analyzeChapterId && (
        <ChapterAnalysisModal 
          chapter={analyzeChapterId} 
          chapterName={analyzeChapterName || 'Chapter Analysis'} 
          userId={USER} 
          onClose={() => {
            const p = new URLSearchParams(window.location.search);
            p.delete('analyzeChapter');
            p.delete('analyzeName');
            navigate(`?${p.toString()}`, { replace: true });
          }}
          onStartTest={(ch, subj) => { 
            navigate(`/test?prefill_type=chapter_mock&prefill_chapter=${ch}&prefill_subject=${subj.toLowerCase()}`); 
          }} 
        />
      )}
    </div>
  );
}

const REVISE_MODES = [
  { id: 'summary', label: '📋 Summary', color: '#6366f1' },
  { id: 'formulas', label: '🧮 Formulas', color: '#10b981' },
  { id: 'mnemonics', label: '🧠 Mnemonics', color: '#f59e0b' },
  { id: 'flashcards', label: '🃏 Flashcards', color: '#ec4899' },
  { id: 'mindmap', label: '🕸️ Mindmap', color: '#a855f7' },
  { id: 'sketchpad', label: '🎨 Sketchpad', color: '#f43f5e' },
];

function ReviseTab() {
  const navigate = useNavigate();
  const [weakTopics, setWeakTopics] = useState<any[]>([]);
  const [allChapters, setAllChapters] = useState<any[]>([]);
  const [selChapter, setSelChapter] = useState<any>(null);
  const [mode, setMode] = useState('summary');
  const [content, setContent] = useState<any>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [flippedCard, setFlippedCard] = useState<number|null>(null);

  useEffect(() => {
    axios.get(`${API}/test/user/${USER}/weak-topics`).then(r => setWeakTopics(r.data.weak_topics||[])).catch(()=>{});
    const cached = localStorage.getItem('curriculum_cache_v3');
    if (cached) {
      const data = JSON.parse(cached);
      const chs: any[] = [];
      data.forEach((curr:any) => (curr.subjects||[]).forEach((subj:any) => (subj.chapters||[]).forEach((ch:any) => chs.push({ ...ch, subject:subj.name, color: SUBJECT_COLORS[subj.name?.toLowerCase()]||'#6366f1' }))));
      setAllChapters(chs);
    }
  }, []);

  const loadContent = async (chapterId: string, m: string) => {
    setLoadingContent(true); setContent(null);
    try { const r = await axios.get(`${API}/graph/chapter/${chapterId}/revision`, { params:{ mode:m } }); setContent(r.data); }
    catch { setContent({ error: true }); }
    setLoadingContent(false);
  };

  const handleChapterSelect = (ch: any) => { setSelChapter(ch); loadContent(ch.id, mode); };
  const handleModeChange = (m: string) => { setMode(m); setFlippedCard(null); if (selChapter) loadContent(selChapter.id, m); };

  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:'1.75rem', fontWeight:900, margin:0 }}>Revision Hub</h1>
        <p style={{ color:'#64748b', margin:'4px 0 0', fontSize:'0.875rem' }}>Summaries, formulas, mnemonics & flashcards — all in one place.</p>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'240px 1fr', gap:20, alignItems:'start' }}>
        <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, overflow:'hidden', maxHeight:'72vh', overflowY:'auto', scrollbarWidth:'thin' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid rgba(255,255,255,0.06)', fontSize:'0.68rem', fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'0.06em' }}>Chapters</div>
          {allChapters.map((ch:any) => (
            <button key={ch.id} onClick={() => handleChapterSelect(ch)}
              style={{ width:'100%', padding:'10px 14px', display:'flex', flexDirection:'column', gap:2, border:'none', background:selChapter?.id===ch.id?`${ch.color}12`:'none', cursor:'pointer', textAlign:'left', borderLeft:selChapter?.id===ch.id?`3px solid ${ch.color}`:'3px solid transparent' }}>
              <span style={{ fontSize:'0.78rem', fontWeight:600, color:selChapter?.id===ch.id?'white':'#94a3b8' }}>{ch.name}</span>
              <span style={{ fontSize:'0.65rem', color:ch.color, textTransform:'capitalize' }}>{ch.subject}</span>
            </button>
          ))}
        </div>
        <div>
          <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
            {REVISE_MODES.map(m => (
              <button key={m.id} onClick={() => handleModeChange(m.id)}
                style={{ padding:'7px 16px', borderRadius:10, border:'none', cursor:'pointer', fontWeight:700, fontSize:'0.8rem', background:mode===m.id?m.color:'rgba(255,255,255,0.06)', color:mode===m.id?'white':'#94a3b8' }}>
                {m.label}
              </button>
            ))}
          </div>
          {!selChapter ? (
            <div style={{ textAlign:'center', padding:60, color:'#334155' }}>
              <RotateCcw size={40} style={{ marginBottom:16, opacity:0.3 }} />
              <div>Select a chapter to start revising</div>
            </div>
          ) : loadingContent ? (
            <div style={{ textAlign:'center', padding:60, color:'#475569', display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
              <div style={{ display: 'flex', gap: 6, padding: '16px 24px', background: 'rgba(30, 41, 59, 0.4)', borderRadius: 20, width: 'fit-content' }}>
                <div style={{ width: 8, height: 8, background: '#818cf8', borderRadius: '50%', animation: 'pulse 1s infinite' }} />
                <div style={{ width: 8, height: 8, background: '#818cf8', borderRadius: '50%', animation: 'pulse 1s infinite', animationDelay: '0.2s' }} />
                <div style={{ width: 8, height: 8, background: '#818cf8', borderRadius: '50%', animation: 'pulse 1s infinite', animationDelay: '0.4s' }} />
              </div>
              <div>Generating AI {mode}...</div>
            </div>
          ) : content ? (
            <div style={{ padding:24, borderRadius:14, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', maxHeight: (mode==='sketchpad'||mode==='mindmap') ? 'none' : '65vh', overflowY: (mode==='sketchpad'||mode==='mindmap') ? 'visible' : 'auto' }}>
              {content.error && (
                <div style={{ textAlign:'center', padding:40, background:'rgba(239,68,68,0.05)', borderRadius:16, border:'1px dashed rgba(239,68,68,0.2)' }}>
                   <AlertTriangle size={32} color="#ef4444" style={{ marginBottom: 16 }} />
                   <div style={{ color:'#fca5a5', fontWeight:700 }}>Something went wrong</div>
                   <p style={{ color:'#991b1b', fontSize:'0.85rem', marginTop:8 }}>We couldn't load the {mode} for this chapter. The chapter might have no topics assigned.</p>
                </div>
              )}
              {!content.error && mode === 'mindmap' && <MindmapVisualizer data={content} />}
              {!content.error && mode === 'sketchpad' && <SketchpadVisualizer data={content} />}
              {!content.error && mode !== 'flashcards' && mode !== 'mindmap' && mode !== 'sketchpad' && (
                <div style={{ background:'rgba(15,23,42,0.5)', padding:20, borderRadius:12 }}>
                  <RichText content={content.text||content.content||'No content available.'} />
                </div>
              )}
              {mode === 'flashcards' && Array.isArray(content.cards) && (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:14 }}>
                  {content.cards.map((card:any, i:number) => (
                    <div key={i} onClick={() => setFlippedCard(flippedCard===i?null:i)}
                      style={{ height:150, borderRadius:12, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', padding:16, textAlign:'center', flexDirection:'column', gap:8, transition:'all 0.3s',
                        background:flippedCard===i?'rgba(99,102,241,0.15)':'rgba(255,255,255,0.04)',
                        border:`1px solid ${flippedCard===i?'rgba(99,102,241,0.4)':'rgba(255,255,255,0.07)'}` }}>
                      <div style={{ fontWeight:600, fontSize:'0.85rem', color:flippedCard===i?'#a5b4fc':'white' }}>
                        {flippedCard===i ? card.answer : card.question}
                      </div>
                      <div style={{ fontSize:'0.65rem', color:'#334155' }}>{flippedCard===i?'tap to flip back':'tap to reveal'}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Loading({ text }: { text: string }) {
  return <div style={{ textAlign:'center', padding:80, color:'#475569' }}>{text}</div>;
}

function Empty({ icon:Icon, title, desc, children }: any) {
  return (
    <div style={{ textAlign:'center', padding:80 }}>
      <div style={{ width:72, height:72, borderRadius:20, background:'rgba(99,102,241,0.1)', border:'1px solid rgba(99,102,241,0.2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}>
        <Icon size={28} color="#6366f1" />
      </div>
      <h2 style={{ fontSize:'1.5rem', fontWeight:800, marginBottom:8 }}>{title}</h2>
      <p style={{ color:'#64748b', marginBottom:24 }}>{desc}</p>
      {children}
    </div>
  );
}

const GlobalStyles = () => (
  <style>{`
    @keyframes pulse {
      0%, 100% { opacity: 0.3; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.1); }
    }
    ::-webkit-scrollbar {
      width: 6px;
    }
    ::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.02);
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 10px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.2);
    }
  `}</style>
);
