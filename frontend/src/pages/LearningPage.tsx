import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  BookOpen, Sparkles, ChevronRight, ChevronLeft, Menu, X,
  Maximize2, Minimize2, Send, GraduationCap, CheckCircle2,
  Circle, Loader2, PlayCircle, Lock, Mic,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

import { fetchCurriculum } from '../utils/api_cache';

import API_URL from '../api_config';
const MOCK_USER = 'user_123';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface CurriculumNode { id: string; name: string; subjects: SubjectNode[]; }
interface SubjectNode    { id: string; name: string; chapters: ChapterNode[]; }
interface ChapterNode    { id: string; name: string; topics: TopicNode[]; }
interface TopicNode      { id: string; name: string; }

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  subtopic_id?: string;
  timestamp: number;
}

type Screen = 'picker' | 'study';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const confidenceColor = (score: number) => {
  if (score >= 80) return '#10b981';
  if (score >= 50) return '#F37920';
  if (score > 0)   return '#f59e0b';
  return '#64748b';
};

const statusDot = (score: number | any, status: string) => {
  const isObj = score && typeof score === 'object';
  const theory = isObj ? (score.theory || 0) : (score || 0);
  const example = isObj ? (score.example || 0) : (score || 0);
  const cross = isObj ? (score.cross || 0) : (score || 0);
  
  const allMastered = theory >= 70 && example >= 70 && cross >= 70;
  const anyProgress = theory > 0 || example > 0 || cross > 0;

  if (status === 'completed' || allMastered) return { icon: '✅', color: '#10b981' };
  if (status === 'in_progress' || anyProgress) return { icon: '🟠', color: '#F37920' };
  return { icon: '⚪', color: '#64748b' };
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function LearningPage() {
  const navigate = useNavigate();
  const { topicId } = useParams<{ topicId: string }>();
  const [searchParams] = useSearchParams();

  // Curriculum hierarchy
  const [curriculums, setCurriculums] = useState<CurriculumNode[]>([]);
  const [selCurriculum, setSelCurriculum] = useState<CurriculumNode | null>(null);
  const [selSubject,    setSelSubject]    = useState<SubjectNode | null>(null);
  const [selChapter,    setSelChapter]    = useState<ChapterNode | null>(null);
  const [selTopic,      setSelTopic]      = useState<TopicNode | null>(null);

  // Study screen
  const [screen, setScreen]             = useState<Screen>('picker');
  const [subtopics, setSubtopics]       = useState<TopicNode[]>([]);
  const [selSubtopic, setSelSubtopic]   = useState<TopicNode | null>(null);
  const [sidebarOpen, setSidebarOpen]   = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');

  // Chat state
  const [messages, setMessages]         = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId]       = useState<string | null>(null);
  const [inputText, setInputText]       = useState('');
  const [sending, setSending]           = useState(false);
  const [greeting, setGreeting]         = useState(false);

  // Progress / confidence
  const [subtopicScores, setSubtopicScores]   = useState<Record<string, any>>({});
  const [subtopicStatus, setSubtopicStatus]   = useState<Record<string, string>>({});
  const [canPractice, setCanPractice]         = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const messageContainerRef = useRef<HTMLDivElement>(null);
  const lastDoubtRef = useRef<string | null>(null);

  // ── Time Tracking via WebSocket
  useEffect(() => {
    let ws: WebSocket | null = null;
    let hb: any = null;

    if (screen === 'study' && selTopic && selSubtopic && sessionId) {
      const wsUrl = `${API_URL.replace('http', 'ws')}/learning/ws/progress/${MOCK_USER}/${selSubtopic.id}`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        // Start heartbeat pinging every 10 seconds
        hb = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN && document.visibilityState === 'visible') {
            ws.send(JSON.stringify({ type: 'heartbeat' }));
          }
        }, 10000); // 10 seconds
      };
      
      ws.onerror = (e) => console.error('Time tracking WS error', e);
    }

    return () => {
      if (hb) clearInterval(hb);
      if (ws) {
        // Send a final message or just close, closing triggers backend save logic for any partial minute
        ws.close();
      }
    };
  }, [screen, selTopic, selSubtopic, sessionId]);

  // ── Scroll to latest message
  useEffect(() => {
    if (messageContainerRef.current) {
      messageContainerRef.current.scrollTop = messageContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // ── Load curriculum, then auto-enter study if URL params present
  useEffect(() => {
    const goal = localStorage.getItem('selected_goal') || 'neet';
    setLoading(true);

    fetchCurriculum(goal).then(data => {
      if (data.length > 0) {
        const saved = JSON.parse(localStorage.getItem('learning_selections') || '{}');
        const c  = data.find((x:any) => x.id === saved.curriculumId) || data[0];
        const s  = c?.subjects?.find((x:any) => x.id === saved.subjectId) || c?.subjects?.[0] || null;
        const ch = s?.chapters?.find((x:any) => x.id === saved.chapterId) || s?.chapters?.[0] || null;

        const autoTopicId = topicId || searchParams.get('topicId');
        let t: TopicNode | null = null;
        if (autoTopicId) {
          outer: for (const sub of c?.subjects || []) {
            for (const chapter of sub.chapters || []) {
              const found = chapter.topics?.find((tp:any) => tp.id === autoTopicId);
              if (found) { t = found; break outer; }
            }
          }
        }
        if (!t) t = ch?.topics?.find((x:any) => x.id === saved.topicId) || ch?.topics?.[0] || null;

        setSelCurriculum(c); setSelSubject(s); setSelChapter(ch); setSelTopic(t);
        setCurriculums(data);

        if ((topicId || searchParams.get('autoStudy') === '1') && t) {
          const doubtCtx = searchParams.get('doubtCtx') || undefined;
          setTimeout(() => triggerAutoStudy(t!, doubtCtx), 200);
        }
      }
      setLoading(false);
    }).catch(e => {
      setError(e.message);
      setLoading(false);
    });
  }, [topicId, searchParams, navigate]);

  // ── Cascading auto-select
  useEffect(() => {
    if (selCurriculum?.subjects && !selCurriculum.subjects.find(s => s.id === selSubject?.id))
      setSelSubject(selCurriculum.subjects[0] || null);
  }, [selCurriculum]);
  useEffect(() => {
    if (selSubject?.chapters && !selSubject.chapters.find(c => c.id === selChapter?.id))
      setSelChapter(selSubject.chapters[0] || null);
    else if (!selSubject) setSelChapter(null);
  }, [selSubject]);
  useEffect(() => {
    if (selChapter?.topics && !selChapter.topics.find(t => t.id === selTopic?.id))
      setSelTopic(selChapter.topics[0] || null);
    else if (!selChapter) setSelTopic(null);
  }, [selChapter]);

  // ── Save to localStorage
  useEffect(() => {
    if (curriculums.length > 0 && (selCurriculum || selSubject || selChapter || selTopic)) {
      localStorage.setItem('learning_selections', JSON.stringify({
        curriculumId: selCurriculum?.id, subjectId: selSubject?.id,
        chapterId: selChapter?.id, topicId: selTopic?.id,
      }));
    }
  }, [selCurriculum, selSubject, selChapter, selTopic, curriculums]);

  // ── Sync screen with topicId URL parameter
  useEffect(() => {
    if (topicId) {
      const doubtCtx = searchParams.get('doubtCtx');
      const isNewTopic = !selTopic || selTopic.id !== topicId;
      const isNewDoubt = doubtCtx && doubtCtx !== lastDoubtRef.current;

      if (screen === 'picker' || isNewTopic || isNewDoubt) {
        // Find the topic in the loaded curriculum
        let t: TopicNode | null = null;
        outer: for (const curr of curriculums) {
          for (const sub of curr.subjects || []) {
            for (const chapter of sub.chapters || []) {
              const found = chapter.topics?.find(tp => tp.id === topicId);
              if (found) { t = found; break outer; }
            }
          }
        }
        if (t) {
          if (isNewDoubt) lastDoubtRef.current = doubtCtx;
          triggerAutoStudy(t, doubtCtx || undefined);
        }
      }
    } else if (screen === 'study') {
      setScreen('picker');
    }
  }, [topicId, curriculums, screen, selTopic, searchParams]);

  // ── Fetch topic progress
  const fetchProgress = useCallback(async (topicId: string, allSubs?: TopicNode[]) => {
    try {
      const res = await axios.get(`${API_URL}/learning/progress/${MOCK_USER}/topic/${topicId}`);
      const scores = res.data.scores || {};
      setSubtopicScores(scores);
      setSubtopicStatus(res.data.progress || {});
      // can_practice: all subtopics in the current list have >= 50% confidence
      const subsToCheck = allSubs || subtopics;
      const canP = subsToCheck.length > 0 && subsToCheck.every(s => {
        const sc = scores[s.id] || 0;
        const avg = typeof sc === 'number' ? sc : ((sc?.theory || 0) + (sc?.example || 0) + (sc?.cross || 0)) / 3;
        return avg >= 60;
      });
      setCanPractice(canP);
    } catch {}
  }, [subtopics]);

  // ── Auto-enter study from external navigation (e.g. Dashboard doubt card)
  const triggerAutoStudy = async (topic: TopicNode, doubtCtx?: string) => {
    setSelTopic(topic);
    setScreen('study');
    setMessages([]);
    setSubtopicScores({});
    setSubtopicStatus({});
    setCanPractice(false);
    setSessionId(null);
    try {
      const res = await axios.get(`${API_URL}/graph/topic/${topic.id}/subtopics`);
      const subs: TopicNode[] = res.data?.subtopics || [];
      const list = subs.length > 0 ? subs : [topic];
      setSubtopics(list);
      setSelSubtopic(list[0]);
      await greetTopic(list, topic, doubtCtx);
      fetchProgress(topic.id, list);
    } catch {
      setSubtopics([topic]);
      setSelSubtopic(topic);
      await greetTopic([topic], topic, doubtCtx);
    }
  };

  // ── Enter study mode
  const enterStudy = async () => {
    if (!selTopic) return;
    // Navigate to separate URL for chat interface
    navigate(`/learning/${selTopic.id}`);
  };

  // ── Topic-level greeting (called ONCE on study mode entry)
  const greetTopic = async (allSubtopics: TopicNode[], topic: TopicNode, doubtCtx?: string) => {
    setGreeting(true);
    try {
      const res = await axios.post(`${API_URL}/learning/chat/greet`, {
        user_id: MOCK_USER,
        topic_id: topic.id,
        topic_name: topic.name,
        subtopic_ids: allSubtopics.map(s => s.id),
        subtopic_names: allSubtopics.map(s => s.name),
        doubt_context: doubtCtx || null,
      });
      const sid = res.data.session_id;
      setSessionId(sid);
      setSubtopicScores(res.data.subtopic_scores || {});

      if (res.data.existing_messages && res.data.existing_messages.length > 0) {
        // Resume existing session — restore message history
        setMessages(res.data.existing_messages.map((m: any) => ({
          ...m, timestamp: Date.now(),
        })));
      } else if (res.data.message) {
        setMessages([{ role: 'assistant', content: res.data.message, timestamp: Date.now() }]);
      }

      // If returning with a specific doubt, trigger automatic streaming query
      if (doubtCtx && allSubtopics.length > 0) {
        console.log('Doubt context present, queuing auto-message:', doubtCtx);
        // Slight delay to ensure state and DOM settle
        setTimeout(() => {
          console.log('Firing sendMessage for doubt...');
          sendMessage(doubtCtx, sid, allSubtopics, allSubtopics[0]);
        }, 500);
      }
    } catch (e: any) {
      console.error('greetTopic Error:', e);
      setError(e.message);
    } finally {
      setGreeting(false);
    }
  };

  // ── Switch subtopic — sidebar only, NO API call
  const selectSubtopic = (st: TopicNode) => {
    setSelSubtopic(st);
  };

  // ── Send chat message
  const sendMessage = async (overrideText?: string, overrideSid?: string, overrideSubtopics?: TopicNode[], overrideSelSub?: TopicNode) => {
    const text = overrideText || inputText;
    const sid = overrideSid || sessionId;
    const subs = overrideSubtopics || subtopics;
    const selSub = overrideSelSub || selSubtopic;

    if (!text?.trim() || !sid || !selSub) return;
    
    const userMsg: ChatMessage = { role: 'user', content: text, subtopic_id: selSub.id, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    if (!overrideText) setInputText('');
    setSending(true);

    try {
      const contextStr = subtopics.map(s => `- ID: "${s.id}" | Name: "${s.name}"`).join('\n');

      // Add placeholder assistant message that we will append stream into
      const placeholderMsg: ChatMessage = { role: 'assistant', content: '', subtopic_id: selSub.id, timestamp: Date.now() };
      setMessages(prev => [...prev, placeholderMsg]);

      const response = await fetch(`${API_URL}/learning/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sid,
          user_id: MOCK_USER,
          subtopic_id: selSub.id,
          subtopic_name: selSub.name,
          user_message: text,
          subtopics_context: contextStr,
        }),
      });

      if (!response.body) throw new Error('No response body');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let accumulatedText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        // Accumulate raw SSE bytes
        sseBuffer += decoder.decode(value, { stream: true });

        // Split on double-newline (SSE event boundary)
        const events = sseBuffer.split("\n\n");
        // Keep the last incomplete event in the buffer
        sseBuffer = events.pop() ?? "";

        for (const event of events) {
          const line = event.trim();
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6); // strip "data: "
          if (payload === "[DONE]") break;

          // Unescape \n that were escaped on the server side
          const text = payload.replace(/\\n/g, "\n");
          accumulatedText += text;

          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              last.content = accumulatedText;
            }
            return [...updated]; // new array ref to trigger re-render
          });
        }
      }

      // After stream fully completes, trigger fetchProgress to refresh scores
      if (selTopic) fetchProgress(selTopic.id, subtopics);

    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Error reaching tutor. Please try again.', timestamp: Date.now() }]);
    } finally {
      setSending(false);
    }
  };

  // ── Manual mark done
  const markDone = async (subtopicId: string) => {
    try {
      await axios.post(`${API_URL}/learning/progress`, {
        user_id: MOCK_USER, 
        topic_id: selTopic?.id, // Added topic_id
        subtopic_id: subtopicId, 
        status: 'completed',
      });
      if (selTopic) await fetchProgress(selTopic.id, subtopics);
      // Update local state with the dictionary format to match the 70/70/70 logic
      setSubtopicScores(prev => ({ 
        ...prev, 
        [subtopicId]: { theory: 70, example: 70, cross: 70 } 
      }));
    } catch {}
  };

  // ── Start Practice
  const startPractice = () => {
    if (!canPractice) return;
    localStorage.setItem('practice_selections', JSON.stringify({
      chapterId: selChapter?.id, chapterName: selChapter?.name,
      topicId: selTopic?.id, topicName: selTopic?.name,
      subtopicId: selSubtopic?.id, subtopicName: selSubtopic?.name,
    }));
    navigate('/practice');
  };

  // ── Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) { document.documentElement.requestFullscreen(); setIsFullscreen(true); }
    else { document.exitFullscreen(); setIsFullscreen(false); }
  };
  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // PICKER SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  if (screen === 'picker') {
    return (
      <div className="animate-fade-in" style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <BookOpen size={32} color="var(--accent-primary)" />
            <h1 className="page-title" style={{ margin: 0 }}>Learning Path</h1>
          </div>
          <p style={{ color: 'var(--text-secondary)' }}>Select your subject and chapter to explore the learning graph</p>
        </div>


        {loading && (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)' }}>
            <Loader2 size={36} style={{ animation: 'spin 0.8s linear infinite', margin: '0 auto 16px', display: 'block' }} />
            Loading curriculum...
          </div>
        )}

        {!loading && curriculums.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '28px' }}>
            {/* Subject */}
            <PickerPanel title="Subject" items={selCurriculum?.subjects || []} selected={selSubject} onSelect={setSelSubject} color="var(--accent-primary)" />
            {/* Chapter */}
            <PickerPanel title="Chapter" items={selSubject?.chapters || []} selected={selChapter} onSelect={(ch) => {
              setSelChapter(ch);
              navigate(`/learning/chapter/${ch.id}/graph`);
            }} color="var(--accent-secondary)" scrollable />
          </div>
        )}




        {error && <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#fca5a5' }}>⚠️ {error}</div>}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STUDY SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  const doneCount = subtopics.filter(st => {
    const rawScore = subtopicScores[st.id] || 0;
    const isObj = rawScore && typeof rawScore === 'object';
    const theory = isObj ? (rawScore.theory || 0) : (rawScore || 0);
    const example = isObj ? (rawScore.example || 0) : (rawScore || 0);
    const cross = isObj ? (rawScore.cross || 0) : (rawScore || 0);
    
    const allMastered = theory >= 70 && example >= 70 && cross >= 70;
    const status = subtopicStatus[st.id] || 'not_started';
    return allMastered || status === 'completed';
  }).length;
  const totalCount = subtopics.length;
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  // ── Quiz Recommendation Logic
  const showQuizRecommendation = canPractice && progressPct >= 70;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: isFullscreen ? '100vh' : 'calc(100vh - 80px)', background: isFullscreen ? '#0f172a' : undefined, overflow: 'hidden' }}>

      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 20px', height: '54px', flexShrink: 0, background: 'rgba(15,23,42,0.95)', borderBottom: '1px solid var(--border-color)', backdropFilter: 'blur(8px)' }}>
        <button onClick={() => {
          if (topicId) navigate('/learning');
          setScreen('picker');
        }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem' }}>
          <ChevronLeft size={16} /> Back
        </button>
        <div style={{ width: '1px', height: '20px', background: 'var(--border-color)' }} />
        <GraduationCap size={18} color="var(--accent-primary)" />
        <span style={{ color: 'white', fontWeight: 600, fontSize: '0.95rem' }}>{selTopic?.name}</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>— {selSubject?.name} › {selChapter?.name}</span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button onClick={() => setSidebarOpen(o => !o)} style={{ background: 'none', border: '1px solid var(--border-color)', padding: '4px 8px', borderRadius: '6px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
          <button
            style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 16px', borderRadius:10, background:'linear-gradient(135deg, #F37920, #ff9d52)', border:'none', color:'white', cursor:'pointer', fontSize:'0.85rem', fontWeight:900, boxShadow: '0 4px 12px rgba(243, 121, 32, 0.3)' }}
          >
            <Mic size={16} fill="white" /> Start Session
          </button>
          <button onClick={toggleFullscreen} style={{ background: 'none', border: '1px solid var(--border-color)', padding: '4px 8px', borderRadius: '6px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      {/* BODY */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* SIDEBAR */}
        {sidebarOpen && (
          <div style={{ width: '260px', flexShrink: 0, background: 'rgba(15,23,42,0.85)', borderRight: '1px solid var(--border-color)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' }}>
            {/* Progress bar */}
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '10px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'baseline' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Topic Progress</span>
                <span style={{ color: doneCount > 0 ? '#10b981' : 'white', fontSize: '0.8rem', fontWeight: 700 }}>{doneCount}/{totalCount} <span style={{ fontWeight: 400, fontSize: '0.68rem', color: 'var(--text-secondary)' }}>mastered</span></span>
              </div>
              <div style={{ height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progressPct}%`, background: doneCount === totalCount && totalCount > 0 ? '#10b981' : 'linear-gradient(90deg, #F37920, #10b981)', borderRadius: '4px', transition: 'width 0.6s ease' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>≥70% = mastered</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{progressPct}%</span>
              </div>
            </div>

            {/* Start Practice button with Recommendation */}
            <div style={{ position: 'relative' }}>
              {showQuizRecommendation && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 10px)', left: '10px', right: '10px',
                  background: 'white', color: '#1e293b', borderRadius: '12px', padding: '10px 12px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                  zIndex: 100, display: 'flex', gap: '10px', alignItems: 'center',
                  animation: 'bounceIn 0.5s ease-out'
                }}>
                  <img src="https://yolearn-assets.s3.us-west-2.amazonaws.com/yo.png" alt="Yo" style={{ width: 24, height: 24, borderRadius: '50%' }} />
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, lineHeight: 1.2 }}>
                    I think you are ready to take a quiz! 🚀
                  </div>
                  <div style={{
                    position: 'absolute', bottom: '100%', left: '30px',
                    width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderBottom: '8px solid white'
                  }} />
                </div>
              )}
              <button
                onClick={startPractice}
                disabled={!canPractice}
                title={canPractice ? 'Start practice session' : 'Score ≥60% on all subtopics to unlock'}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  padding: '10px 12px', borderRadius: '8px', fontSize: '0.83rem', fontWeight: 600, cursor: canPractice ? 'pointer' : 'not-allowed',
                  background: canPractice ? 'linear-gradient(135deg, #F37920, #10b981)' : 'rgba(255,255,255,0.05)',
                  border: canPractice ? 'none' : '1px solid rgba(255,255,255,0.1)',
                  color: canPractice ? 'white' : 'var(--text-secondary)',
                  transition: 'all 0.2s',
                }}
              >
                {canPractice ? <PlayCircle size={15} /> : <Lock size={14} />}
                {canPractice ? 'Start Practice' : 'Practice Locked'}
              </button>
            </div>

            {/* Subtopic list */}
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
              Subtopics ({subtopics.length})
            </p>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
              {subtopics.map(st => {
                const rawScore = subtopicScores[st.id] ?? 0;
                const isLegacyNumber = typeof rawScore === 'number';
                const scoreObj = isLegacyNumber ? { theory: rawScore, example: rawScore, cross: rawScore } : rawScore;
                
                const avgScore = Math.round(((scoreObj.theory || 0) + (scoreObj.example || 0) + (scoreObj.cross || 0)) / 3);
                const allMastered = (scoreObj.theory || 0) >= 70 && (scoreObj.example || 0) >= 70 && (scoreObj.cross || 0) >= 70;
                
                const status = subtopicStatus[st.id] ?? 'not_started';
                const dot = statusDot(avgScore, status);
                const isActive = selSubtopic?.id === st.id;
                
                return (
                  <div key={st.id} style={{ flexShrink: 0, borderRadius: '8px', overflow: 'hidden', border: isActive ? '1px solid var(--accent-primary)' : '1px solid transparent', background: isActive ? 'rgba(243, 121, 32, 0.1)' : 'transparent', transition: 'all 0.15s', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 10px 0' }}>
                      <button onClick={() => selectSubtopic(st)} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.4, display: 'flex', alignItems: 'flex-start', gap: '8px', padding: 0 }}>
                        <span style={{ fontSize: '0.7rem', marginTop: '2px', flexShrink: 0 }}>{dot.icon}</span>
                        <span>{st.name}</span>
                      </button>
                      {status !== 'completed' && !allMastered && (
                        <button onClick={(e) => { e.stopPropagation(); markDone(st.id); }} style={{ flexShrink: 0, padding: '2px 6px', borderRadius: '4px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer' }}>
                          DONE
                        </button>
                      )}
                    </div>
                    <div style={{ padding: '0 10px 8px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {/* Theory */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', width: '35px' }}>Theory</span>
                            <div style={{ flex: 1, height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${scoreObj.theory || 0}%`, background: confidenceColor(scoreObj.theory || 0), borderRadius: '2px' }} />
                            </div>
                            <span style={{ fontSize: '0.6rem', color: confidenceColor(scoreObj.theory || 0), fontWeight: 600, width: '20px', textAlign: 'right' }}>{scoreObj.theory || 0}%</span>
                          </div>
                          {/* Example */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', width: '35px' }}>Example</span>
                            <div style={{ flex: 1, height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${scoreObj.example || 0}%`, background: confidenceColor(scoreObj.example || 0), borderRadius: '2px' }} />
                            </div>
                            <span style={{ fontSize: '0.6rem', color: confidenceColor(scoreObj.example || 0), fontWeight: 600, width: '20px', textAlign: 'right' }}>{scoreObj.example || 0}%</span>
                          </div>
                          {/* Cross */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', width: '35px' }}>Cross</span>
                            <div style={{ flex: 1, height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${scoreObj.cross || 0}%`, background: confidenceColor(scoreObj.cross || 0), borderRadius: '2px' }} />
                            </div>
                            <span style={{ fontSize: '0.6rem', color: confidenceColor(scoreObj.cross || 0), fontWeight: 600, width: '20px', textAlign: 'right' }}>{scoreObj.cross || 0}%</span>
                          </div>
                        </div>
                    </div>

                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* CHAT AREA */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Subtopic header */}
          {selSubtopic && (
            <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border-color)', background: 'rgba(15,23,42,0.6)', flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'white' }}>{selSubtopic.name}</h2>
              <p style={{ margin: '2px 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{selSubject?.name} › {selChapter?.name} › {selTopic?.name}</p>
            </div>
          )}

          {/* Messages */}
          <div ref={messageContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {messages.length === 0 && greeting && (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', paddingTop: '60px' }}>
                <Loader2 size={28} style={{ animation: 'spin 0.8s linear infinite', margin: '0 auto 12px', display: 'block' }} />
                Your tutor is preparing...
              </div>
            )}

            {messages.map((msg, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '10px', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', alignItems: 'flex-start' }}>
                {msg.role === 'assistant' && (
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, #F37920, #ff9d52)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <GraduationCap size={16} color="white" />
                  </div>
                )}
                <div style={{
                  maxWidth: '70%', padding: '12px 16px', borderRadius: msg.role === 'user' ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                  background: msg.role === 'user' ? 'linear-gradient(135deg, #F37920, #ff9d52)' : 'rgba(255,255,255,0.06)',
                  border: msg.role === 'assistant' ? '1px solid rgba(255,255,255,0.08)' : 'none',
                  color: 'white', fontSize: '0.9rem', lineHeight: 1.7,
                }}>
                  {msg.role === 'assistant' ? (
                    <div className="markdown-content">
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}
                        components={{
                          strong: ({ children }) => <strong style={{ color: 'var(--accent-secondary)' }}>{children}</strong>,
                          code: ({ children }) => <code style={{ background: 'rgba(243, 121, 32, 0.2)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.85em' }}>{children}</code>,
                        }}
                      >{msg.content}</ReactMarkdown>
                    </div>
                  ) : msg.content}
                </div>
              </div>
            ))}

            {sending && (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, #F37920, #ff9d52)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <GraduationCap size={16} color="white" />
                </div>
                <div style={{ padding: '12px 16px', borderRadius: '4px 16px 16px 16px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <span style={{ display: 'flex', gap: '4px' }}>
                    {[0,1,2].map(i => <span key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#F37920', display: 'inline-block', animation: `bounce 1s ease ${i * 0.2}s infinite` }} />)}
                  </span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', background: 'rgba(15,23,42,0.8)', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
              <textarea
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={`Ask your tutor about ${selSubtopic?.name || 'this topic'}...`}
                rows={2}
                style={{
                  flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '12px', padding: '10px 14px', color: 'white', fontSize: '0.9rem',
                  resize: 'none', outline: 'none', lineHeight: 1.5,
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = '#F37920'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
                disabled={sending || greeting || !sessionId}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!inputText.trim() || sending || greeting || !sessionId}
                style={{
                  width: '44px', height: '44px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                  background: inputText.trim() && !sending ? 'linear-gradient(135deg, #F37920, #ff9d52)' : 'rgba(255,255,255,0.08)',
                  color: inputText.trim() && !sending ? 'white' : '#64748b',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s', flexShrink: 0,
                }}
              >
                <Send size={18} />
              </button>
            </div>
            <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: '0.72rem', opacity: 0.6 }}>
              Press Enter to send • Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes bounce { 0%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-6px); } }
        .markdown-content p { margin: 0.5em 0; }
        .markdown-content ul, .markdown-content ol { padding-left: 1.5em; }
        .markdown-content li { margin: 0.2em 0; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 3px; }
        @keyframes bounceIn {
          from { opacity: 0; transform: scale(0.9) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Picker Panel sub-component
// ─────────────────────────────────────────────────────────────────────────────
function PickerPanel({ title, items, selected, onSelect, color, scrollable }: {
  title: string; items: any[]; selected: any; onSelect: (v: any) => void; color: string; scrollable?: boolean;
}) {
  return (
    <div className="glass-panel" style={{ padding: '20px' }}>
      <h3 style={{ margin: '0 0 14px', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: scrollable ? '320px' : undefined, overflowY: scrollable ? 'auto' : undefined }}>
        {items.map((item: any) => (
          <button key={item.id} onClick={() => onSelect(item)} style={{
            textAlign: 'left', padding: '10px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.87rem', lineHeight: 1.3,
            border: selected?.id === item.id ? `1px solid ${color}` : '1px solid transparent',
            background: selected?.id === item.id ? `${color}22` : 'transparent',
            color: selected?.id === item.id ? color : 'var(--text-secondary)',
            transition: 'all 0.15s',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <span>{item.name}</span>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
               <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.floor(Math.random() * 100)}%`, height: '100%', background: color }} />
               </div>
               <span style={{ fontSize: '0.6rem', opacity: 0.6 }}>Level {Math.floor(Math.random() * 5) + 1}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
