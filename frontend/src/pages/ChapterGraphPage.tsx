import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  ChevronLeft, 
  Play, 
  BookOpen, 
  Target, 
  Award, 
  Clock,
  Zap,
  Info,
  ChevronRight,
  ShieldAlert,
  Loader2,
  X,
  Send,
  User,
  Sparkles,
  Maximize2,
  Minimize2,
  Mic,
} from 'lucide-react';
import RichText from '../components/RichText';

const API_URL = 'http://127.0.0.1:8002/api/v1';
const MOCK_USER = 'user_123';

interface Subtopic {
  id: string;
  name: string;
}

interface Topic {
  id: string;
  name: string;
  subtopics: Subtopic[];
}

interface ChapterGraphData {
  chapter_id: string;
  topics: Topic[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export default function ChapterGraphPage() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ChapterGraphData | null>(null);
  const [chapterName, setChapterName] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  
  // Study Mode State
  const [studyMode, setStudyMode] = useState(false);
  const [selTopic, setSelTopic] = useState<Topic | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [subtopicScores, setSubtopicScores] = useState<Record<string, {theory: number, example: number, cross: number}>>({});
  const [showSubtopics, setShowSubtopics] = useState(false);
  const [previewTopic, setPreviewTopic] = useState<Topic | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!chapterId) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await axios.get(`${API_URL}/graph/chapter/${chapterId}/graph`);
        
        setData(res.data);
        setChapterName(res.data.chapter_name || '');
        setSubjectName(res.data.subject || '');
        
      } catch (error) {
        console.error('Error fetching graph data:', error);
      } finally {
        setLoading(false);
        const hasTakenDiagnostic = localStorage.getItem(`diagnostic_${chapterId}`);
        if (!hasTakenDiagnostic) {
          setShowDiagnostic(true);
        }
      }
    };

    fetchData();
  }, [chapterId]);

  const handleStartStudy = async (topic: Topic) => {
    setSelTopic(topic);
    setStudyMode(true);
    setMessages([]);
    setSessionId(null);
    setSending(true);
    
    // Greet the topic
    try {
      const res = await axios.post(`${API_URL}/learning/chat/greet`, {
        user_id: MOCK_USER,
        topic_id: topic.id,
        topic_name: topic.name,
        subtopic_ids: topic.subtopics.map(s => s.id),
        subtopic_names: topic.subtopics.map(s => s.name),
      });
      
      setSessionId(res.data.session_id);
      // Load confidence scores for subtopics
      const scores = res.data.subtopic_scores || {};
      const detailedScores: Record<string, {theory: number, example: number, cross: number}> = {};
      for (const [sid, val] of Object.entries(scores)) {
        if (typeof val === 'object' && val !== null) {
          detailedScores[sid] = { theory: (val as any).theory_confidence || (val as any).theory || 0, example: (val as any).example_confidence || (val as any).example || 0, cross: (val as any).cross_section_confidence || (val as any).cross || 0 };
        } else {
          detailedScores[sid] = { theory: Number(val) || 0, example: 0, cross: 0 };
        }
      }
      setSubtopicScores(detailedScores);
      if (res.data.existing_messages && res.data.existing_messages.length > 0) {
        setMessages(res.data.existing_messages.map((m: any) => ({ ...m, timestamp: Date.now() })));
      } else if (res.data.message) {
        setMessages([{ role: 'assistant', content: res.data.message, timestamp: Date.now() }]);
      } else {
        setMessages([{ role: 'assistant', content: "Hello! I am your AI Learning Tutor. Let's start studying this topic. What would you like to know?", timestamp: Date.now() }]);
      }
    } catch (err) {
      console.error('Error greeting topic:', err);
      setMessages([{ role: 'assistant', content: "Hello! I am your AI Learning Tutor. Let's start studying this topic. What would you like to know?", timestamp: Date.now() }]);
    } finally {
      setSending(false);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !sessionId || !selTopic || sending) return;

    const text = inputText;
    setInputText('');
    setSending(true);

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);

    try {
      const placeholderMsg: ChatMessage = { role: 'assistant', content: '', timestamp: Date.now() };
      setMessages(prev => [...prev, placeholderMsg]);

      const contextStr = selTopic.subtopics.map(s => `- ID: "${s.id}" | Name: "${s.name}"`).join('\n');

      const response = await fetch(`${API_URL}/learning/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          user_id: MOCK_USER,
          subtopic_id: selTopic.id, // Primary topic
          subtopic_name: selTopic.name,
          user_message: text,
          subtopics_context: contextStr,
        }),
      });

      if (!response.body) throw new Error('No response body');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let accumulatedRaw = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const events = sseBuffer.split("\n\n");
        sseBuffer = events.pop() ?? "";

        for (const event of events) {
          const line = event.trim();
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") break;

          const chunk = payload.replace(/\\n/g, "\n");
          accumulatedRaw += chunk;

          // Strip __METADATA__ blocks (confidence scores / doubts) from display
          const metaMatch = accumulatedRaw.match(/__METADATA__\s*(\{[\s\S]*\})\s*$/);
          let displayText = accumulatedRaw;
          
          if (metaMatch) {
            displayText = accumulatedRaw.replace(/__METADATA__[\s\S]*$/, '').trimEnd();
            try {
              const metaData = JSON.parse(metaMatch[1]);
              if (metaData.scores && Object.keys(metaData.scores).length > 0) {
                 setSubtopicScores(prev => ({ 
                   ...prev, 
                   ...metaData.scores 
                 }));
              }
            } catch (e) {
              // partial JSON, ignore until complete
            }
          } else {
            displayText = accumulatedRaw.replace(/__METADATA__[\s\S]*$/, '').trimEnd();
          }

          setMessages(prev => {
            if (prev.length === 0) return prev;
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              last.content = displayText;
              return updated;
            }
            return prev;
          });
        }
      }
    } catch (err) {
      console.error('Chat error:', err);
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Error reaching tutor.', timestamp: Date.now() }]);
    } finally {
      setSending(false);
    }
  };

  const handleStartDiagnostic = async () => {
    try {
      const res = await axios.post(`${API_URL}/test/session/create`, {
        user_id: MOCK_USER,
        test_type: 'topic_quiz',
        subject: subjectName.toLowerCase(),
        chapter: chapterName,
        chapter_id: chapterId,
        question_count: 10,
        time_limit_mins: 15
      });
      
      localStorage.setItem(`diagnostic_${chapterId}`, 'true');
      navigate(`/test/${res.data.session_id}`);
    } catch (error) {
      console.error('Error starting diagnostic quiz:', error);
      alert('Failed to start diagnostic quiz. Please try again.');
    }
  };

  const markDone = async (subtopicId: string) => {
    try {
      await axios.post(`${API_URL}/learning/progress`, {
        user_id: MOCK_USER, 
        topic_id: selTopic?.id,
        subtopic_id: subtopicId, 
        status: 'completed',
      });
      setSubtopicScores(prev => ({
        ...prev,
        [subtopicId]: { theory: 70, example: 70, cross: 70 }
      }));
    } catch (e) {
      console.error("Error marking done:", e);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const masteredSubtopics = selTopic ? selTopic.subtopics.filter(st => {
    const s = subtopicScores[st.id] || {theory:0, example:0, cross:0};
    return s.theory >= 70 && s.example >= 70 && s.cross >= 70;
  }).length : 0;
  
  const totalSubtopics = selTopic ? selTopic.subtopics.length : 0;
  const topicProgress = totalSubtopics > 0 ? Math.round((masteredSubtopics / totalSubtopics) * 100) : 0;
  const showQuizRecommendation = topicProgress >= 70;

  if (loading) {
    return (
      <div className="loading-screen">
        <Loader2 size={48} className="spin-icon" />
        <p>Generating Chapter Graph...</p>
      </div>
    );
  }

  return (
    <div className={`graph-page ${studyMode ? 'study-mode' : ''}`}>
      {/* Top Header (Only in non-study mode or as small bar) */}
      {!studyMode && (
        <div className="graph-header">
          <button onClick={() => navigate('/learning')} className="back-btn">
            <ChevronLeft size={20} />
            Back to Path
          </button>
          <div className="chapter-badge">
            <BookOpen size={18} />
            <span>{chapterName || 'Chapter Graph'}</span>
          </div>
          <button onClick={toggleFullscreen} className="fullscreen-btn">
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>
      )}

      <div className="page-layout">
        {/* Left Column: The Flow Chart (Graph) */}
        <div className={`graph-column ${studyMode ? 'sidebar' : 'full'}`} ref={graphRef}>
          {studyMode && (
             <div className="sidebar-header">
                <button onClick={() => setStudyMode(false)} className="back-to-graph">
                  <ChevronLeft size={16} /> Close Tutor
                </button>
                <div className="sidebar-title">{chapterName}</div>
             </div>
          )}
          
          <div className="graph-container">
            <div className="chapter-node">
              <div className="node-icon main">
                <Award size={32} />
              </div>
              <h2>{chapterName}</h2>
              <div className="node-stats">
                <span>{data?.topics.length} Topics</span>
                <span>•</span>
                <span>{data?.topics.reduce((acc, t) => acc + t.subtopics.length, 0)} Subtopics</span>
              </div>
              
              <button className="re-diagnostic-btn" onClick={() => setShowDiagnostic(true)}>
                <ShieldAlert size={14} />
                Re-take Diagnostic
              </button>
            </div>

            <div className="topics-flow">
              {data?.topics.map((topic, index) => (
                <div key={topic.id} className={`topic-branch ${selTopic?.id === topic.id ? 'active' : ''}`}>
                  <div className="connector-path">
                    <div className="path-vertical" />
                    <div className="path-horizontal" />
                  </div>
                  
                  <div className="topic-node-wrapper">
                    <div className="topic-node" onClick={() => setPreviewTopic(topic)}>
                      <div className="topic-content">
                        <div className="topic-index">{index + 1}</div>
                        <div className="topic-text">
                          <h3>{topic.name}</h3>
                          {!studyMode && <p>{topic.subtopics.length} Concepts to master</p>}
                        </div>
                      </div>
                      <div className="topic-action">
                        <Play size={14} />
                      </div>
                    </div>

                    {!studyMode && (
                      <div className="subtopics-list">
                        {topic.subtopics.map((st) => (
                          <div key={st.id} className="subtopic-item">
                            <div className="subtopic-dot" />
                            <span>{st.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: AI Tutor Chat */}
        {studyMode && (
          <div className="tutor-column animate-slide-left">
            <div className="tutor-header">
              <div className="tutor-info">
                <div className="tutor-avatar">
                  <Sparkles size={20} />
                </div>
                <div>
                  <div className="tutor-name">AI Learning Tutor</div>
                  <div className="tutor-status">Studying: {selTopic?.name}</div>
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ position: 'relative' }}>
                  {showQuizRecommendation && (
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)', width: '200px',
                      background: 'white', color: '#1e293b', borderRadius: '12px', padding: '10px 12px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                      zIndex: 100, display: 'flex', gap: '10px', alignItems: 'center',
                      animation: 'bounceIn 0.5s ease-out'
                    }}>
                      <img src="https://yolearn-assets.s3.us-west-2.amazonaws.com/yo.png" alt="Yo" style={{ width: 24, height: 24, borderRadius: '50%' }} />
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, lineHeight: 1.2 }}>
                        I think you are ready to take a quiz! 🚀
                      </div>
                      <div style={{
                        position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                        width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderBottom: '6px solid white'
                      }} />
                    </div>
                  )}
                  <button
                    onClick={() => {
                      if (selTopic) {
                        window.open(`/test?prefill_subject=${encodeURIComponent(subjectName.toLowerCase())}&prefill_chapter=${encodeURIComponent(chapterId)}&prefill_topic=${encodeURIComponent(selTopic.id)}&prefill_type=topic_quiz`, '_blank');
                      }
                    }}
                    style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:8, background:'linear-gradient(135deg,rgba(99,102,241,0.2),rgba(16,185,129,0.2))', border:'1px solid rgba(99,102,241,0.3)', color:'#a5b4fc', cursor:'pointer', fontSize:'0.78rem', fontWeight:700, whiteSpace:'nowrap' }}>
                    📝 Quiz Me
                  </button>
                </div>
                <button
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 16px', borderRadius:10, background:'linear-gradient(135deg, #6366f1, #8b5cf6)', border:'none', color:'white', cursor:'pointer', fontSize:'0.82rem', fontWeight:900, boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}
                >
                  <Mic size={16} fill="white" /> Start Session
                </button>
                <button onClick={toggleFullscreen} className="header-icon-btn">
                  {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>
              </div>
            </div>

            {/* Subtopic Confidence Panel */}
            {selTopic && selTopic.subtopics.length > 0 && (
              <div className="subtopic-panel">
                <button onClick={() => setShowSubtopics(!showSubtopics)} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', background:'none', border:'none', cursor:'pointer', padding:0 }}>
                  <div className="subtopic-panel-title" style={{ margin:0 }}>
                    <BookOpen size={13} />
                    Subtopics — {selTopic.name}
                  </div>
                  <div style={{ color:'#475569', fontSize:'0.7rem', fontWeight:700 }}>
                    {showSubtopics ? 'HIDE' : 'SHOW'}
                  </div>
                </button>
                
                {showSubtopics && (
                  <div className="subtopic-panel-list" style={{ marginTop:14 }}>
                    {selTopic.subtopics.map(st => {
                      const scores = subtopicScores[st.id] || {theory:0, example:0, cross:0};
                      const avgScore = Math.round((scores.theory + scores.example + scores.cross) / 3);
                      const mastered = avgScore >= 70;
                      return (
                        <div key={st.id} className={`subtopic-conf-item ${mastered ? 'mastered' : ''}`} style={{ marginBottom: 8, padding: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <div className="subtopic-conf-name" style={{ margin: 0 }}>{st.name}</div>
                            {!mastered && (
                              <button 
                                onClick={() => markDone(st.id)}
                                style={{ padding: '4px 10px', borderRadius: '6px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981', fontSize: '0.65rem', fontWeight: 800, cursor: 'pointer' }}
                              >
                                MARK DONE
                              </button>
                            )}
                          </div>
                          
                          {/* Theory Bar */}
                          <div className="subtopic-conf-bar-row" style={{ marginBottom: 4 }}>
                            <div style={{ width: 45, fontSize: '0.65rem', color: '#94a3b8' }}>Theory</div>
                            <div className="subtopic-conf-bar">
                              <div className="subtopic-conf-fill" style={{ width: `${scores.theory}%`, background: scores.theory >= 70 ? '#10b981' : scores.theory > 0 ? '#6366f1' : '#334155' }} />
                            </div>
                            <span className="subtopic-pct" style={{ color: scores.theory > 0 ? '#818cf8' : '#475569' }}>{scores.theory}%</span>
                          </div>

                          {/* Example Bar */}
                          <div className="subtopic-conf-bar-row" style={{ marginBottom: 4 }}>
                            <div style={{ width: 45, fontSize: '0.65rem', color: '#94a3b8' }}>Example</div>
                            <div className="subtopic-conf-bar">
                              <div className="subtopic-conf-fill" style={{ width: `${scores.example}%`, background: scores.example >= 70 ? '#10b981' : scores.example > 0 ? '#8b5cf6' : '#334155' }} />
                            </div>
                            <span className="subtopic-pct" style={{ color: scores.example > 0 ? '#c084fc' : '#475569' }}>{scores.example}%</span>
                          </div>

                          {/* Cross-section Bar */}
                          <div className="subtopic-conf-bar-row">
                            <div style={{ width: 45, fontSize: '0.65rem', color: '#94a3b8' }}>Cross</div>
                            <div className="subtopic-conf-bar">
                              <div className="subtopic-conf-fill" style={{ width: `${scores.cross}%`, background: scores.cross >= 70 ? '#10b981' : scores.cross > 0 ? '#ec4899' : '#334155' }} />
                            </div>
                            <span className="subtopic-pct" style={{ color: scores.cross > 0 ? '#f472b6' : '#475569' }}>{scores.cross}%</span>
                          </div>

                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="chat-messages">
              {messages.map((msg, i) => (
                <div key={i} className={`message-wrapper ${msg.role}`}>
                  <div className="message-icon">
                    {msg.role === 'user' ? <User size={16} /> : <Sparkles size={16} />}
                  </div>
                  <div className="message-bubble">
                    {msg.role === 'assistant' ? (
                      <RichText content={msg.content} />
                    ) : (
                      <div className="user-text">{msg.content}</div>
                    )}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="typing-indicator">
                  <span></span><span></span><span></span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-area">
              <div className="input-container">
                <input 
                  type="text" 
                  placeholder={`Ask anything about ${selTopic?.name}...`}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                />
                <button 
                  className={`send-btn ${!inputText.trim() || sending ? 'disabled' : ''}`}
                  onClick={sendMessage}
                >
                  <Send size={20} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewTopic && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', backdropFilter:'blur(12px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20 }}>
          <div style={{ background:'#0f172a', border:'1px solid rgba(255,255,255,0.1)', borderRadius:32, maxWidth:550, width:'100%', overflow:'hidden', boxShadow:'0 25px 50px -12px rgba(0,0,0,0.5)' }}>
            <div style={{ position:'relative', padding:32, background:'linear-gradient(135deg, rgba(99, 102, 241, 0.1), transparent)' }}>
              <button onClick={() => setPreviewTopic(null)} style={{ position:'absolute', top:24, right:24, background:'rgba(255,255,255,0.05)', border:'none', color:'#94a3b8', borderRadius:'50%', padding:8, cursor:'pointer' }}><X size={20}/></button>
              
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                <div style={{ padding:10, borderRadius:12, background:'rgba(99,102,241,0.1)', color:'#6366f1' }}><BookOpen size={24}/></div>
                <div>
                  <h2 style={{ margin:0, fontSize:'1.5rem', fontWeight:800, color:'white' }}>{previewTopic.name}</h2>
                  <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:4 }}>
                    <span style={{ fontSize:'0.85rem', color:'#64748b', display:'flex', alignItems:'center', gap:4 }}><Clock size={14}/> 45 min session</span>
                    <span style={{ fontSize:'0.85rem', color:'#2dd4bf', display:'flex', alignItems:'center', gap:4 }}><Mic size={14}/> Voice Tutor Enabled</span>
                  </div>
                </div>
              </div>

              <div style={{ background:'rgba(255,255,255,0.03)', borderRadius:20, padding:20, border:'1px solid rgba(255,255,255,0.05)' }}>
                <h3 style={{ margin:'0 0 16px 0', fontSize:'0.9rem', fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em' }}>Subtopics to be covered</h3>
                <div style={{ display:'flex', flexDirection:'column', gap:12, maxHeight:200, overflowY:'auto', paddingRight:8, scrollbarWidth:'thin' }}>
                  {(previewTopic.subtopics || []).map((s:any, i:number) => (
                    <div key={i} style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
                      <div style={{ width:20, height:20, borderRadius:6, background:'rgba(99,102,241,0.1)', color:'#6366f1', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.7rem', fontWeight:800, flexShrink:0 }}>{i+1}</div>
                      <span style={{ fontSize:'0.95rem', color:'white', lineHeight:1.4 }}>{s.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop:32, display:'flex', flexDirection:'column', gap:12 }}>
                <button 
                  onClick={() => {
                    handleStartStudy(previewTopic);
                    setPreviewTopic(null);
                  }}
                  style={{ width:'100%', padding:'16px', borderRadius:16, border:'none', background:'white', color:'black', fontWeight:800, fontSize:'1rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:10, transition:'all 0.2s' }}
                >
                  <Play size={18} fill="black" /> Start Study Session
                </button>
                
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <button 
                    onClick={() => {
                       // Doubt session just enters study mode for now or we can customize
                       handleStartStudy(previewTopic);
                       setPreviewTopic(null);
                    }}
                    style={{ padding:'14px', borderRadius:16, border:'1px solid rgba(99,102,241,0.2)', background:'rgba(99,102,241,0.05)', color:'#a5b4fc', fontWeight:700, fontSize:'0.9rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}
                  >
                    <Send size={18} /> Doubt Session
                  </button>
                  <button 
                    disabled
                    style={{ padding:'14px', borderRadius:16, border:'1px solid rgba(255,255,255,0.05)', background:'rgba(255,255,255,0.03)', color:'#475569', fontWeight:700, fontSize:'0.9rem', cursor:'not-allowed', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}
                  >
                    <Award size={18} /> Review Material
                  </button>
                </div>
              </div>

              <div style={{ marginTop:24, textAlign:'center', fontSize:'0.75rem', color:'#475569' }}>
                Join the voice call to start interacting with your personalized AI tutor.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Diagnostic Popup */}
      {showDiagnostic && (
        <div className="modal-overlay">
          <div className="diagnostic-modal animate-pop">
            <div className="modal-glow" />
            <button className="close-modal" onClick={() => setShowDiagnostic(false)}>
              <X size={20} />
            </button>
            
            <div className="modal-icon-wrapper">
              <div className="modal-icon">
                <Target size={42} />
              </div>
              <div className="icon-rings">
                <div className="ring" />
                <div className="ring" />
              </div>
            </div>

            <h2 className="modal-title">Assess Your Knowledge</h2>
            <p className="modal-desc">
              Ready to master <strong>{chapterName}</strong>? 
              Our AI diagnostic identifies your skill gaps to build a personalized study path just for you.
            </p>
            
            <div className="modal-features">
              <div className="feature-item">
                <div className="feature-icon"><Clock size={16} /></div>
                <div className="feature-text">
                  <span className="feature-label">Duration</span>
                  <span className="feature-val">15 Minutes</span>
                </div>
              </div>
              <div className="feature-item">
                <div className="feature-icon"><Sparkles size={16} /></div>
                <div className="feature-text">
                  <span className="feature-label">Insights</span>
                  <span className="feature-val">AI Powered</span>
                </div>
              </div>
              <div className="feature-item">
                <div className="feature-icon"><Award size={16} /></div>
                <div className="feature-text">
                  <span className="feature-label">Outcome</span>
                  <span className="feature-val">Skill Map</span>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-skip" onClick={() => {
                localStorage.setItem(`diagnostic_${chapterId}`, 'skipped');
                setShowDiagnostic(false);
              }}>
                Skip for now
              </button>
              <button className="btn-start" onClick={handleStartDiagnostic}>
                Start Diagnostic <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .graph-page {
          height: 100vh;
          background: #020617;
          display: flex;
          flex-direction: column;
          color: white;
          overflow: hidden;
          font-family: 'Inter', system-ui, sans-serif;
        }

        .graph-header {
          padding: 16px 24px;
          display: flex;
          align-items: center;
          gap: 24px;
          background: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          z-index: 10;
        }

        .back-btn, .fullscreen-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #94a3b8;
          padding: 8px 16px;
          border-radius: 12px;
          cursor: pointer;
          font-size: 0.875rem;
          font-weight: 500;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .fullscreen-btn {
          margin-left: auto;
          padding: 8px;
        }

        .back-btn:hover, .fullscreen-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          color: white;
          border-color: rgba(99, 102, 241, 0.5);
          transform: translateY(-1px);
        }

        .chapter-badge {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #818cf8;
          font-weight: 600;
          font-size: 0.9375rem;
        }

        .page-layout {
          flex: 1;
          display: flex;
          overflow: hidden;
        }

        .graph-column {
          overflow-y: auto;
          background-image: 
            radial-gradient(circle at 20% 30%, rgba(99, 102, 241, 0.05) 0%, transparent 40%),
            radial-gradient(circle at 80% 70%, rgba(236, 72, 153, 0.03) 0%, transparent 40%);
          /* No width transition — prevents topic list from re-ordering visually on click */
          scrollbar-width: none;
        }

        .graph-column::-webkit-scrollbar { display: none; }

        .graph-column.full {
          width: 100%;
          padding: 80px 20px;
        }

        .graph-column.sidebar {
          width: 35%;
          border-right: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(15, 23, 42, 0.3);
          padding: 24px;
        }

        .sidebar-header {
          margin-bottom: 32px;
          padding-bottom: 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .back-to-graph {
          background: none;
          border: none;
          color: #6366f1;
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          margin-bottom: 12px;
          transition: all 0.2s;
        }

        .back-to-graph:hover { color: #818cf8; transform: translateX(-4px); }

        .sidebar-title {
          font-size: 1.25rem;
          font-weight: 800;
          color: white;
          line-height: 1.3;
        }

        .graph-container {
          max-width: 900px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .sidebar .graph-container {
          max-width: 100%;
          align-items: flex-start;
        }

        .chapter-node {
          text-align: center;
          margin-bottom: 100px;
          position: relative;
        }

        .sidebar .chapter-node {
          text-align: left;
          margin-bottom: 48px;
        }

        .node-icon.main {
          width: 96px;
          height: 96px;
          background: linear-gradient(135deg, #6366f1, #a855f7);
          border-radius: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 28px;
          box-shadow: 
            0 20px 40px -10px rgba(99, 102, 241, 0.5),
            inset 0 2px 4px rgba(255, 255, 255, 0.2);
          position: relative;
        }

        .node-icon.main::after {
          content: '';
          position: absolute;
          inset: -4px;
          border-radius: 36px;
          border: 2px solid rgba(99, 102, 241, 0.3);
          animation: pulse 2s infinite;
        }

        .sidebar .node-icon.main {
          width: 56px;
          height: 56px;
          margin: 0 0 20px 0;
          border-radius: 16px;
        }

        .sidebar .node-icon.main svg { width: 24px; height: 24px; }
        .sidebar .node-icon.main::after { display: none; }

        .chapter-node h2 {
          font-size: 3rem;
          font-weight: 900;
          margin-bottom: 12px;
          letter-spacing: -0.04em;
          background: linear-gradient(to bottom, #fff, #94a3b8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .sidebar .chapter-node h2 {
          font-size: 1.75rem;
        }

        .node-stats {
          display: flex;
          gap: 16px;
          color: #94a3b8;
          font-size: 0.9375rem;
          font-weight: 600;
          margin-bottom: 32px;
          justify-content: center;
        }

        .sidebar .node-stats { justify-content: flex-start; margin-bottom: 24px; }

        .re-diagnostic-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.2);
          color: #a5b4fc;
          padding: 8px 16px;
          border-radius: 12px;
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
          margin: 0 auto;
          transition: all 0.3s;
        }

        .sidebar .re-diagnostic-btn { margin: 0; }

        .re-diagnostic-btn:hover {
          background: rgba(99, 102, 241, 0.2);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .topics-flow {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 56px;
          padding-left: 60px;
        }

        .sidebar .topics-flow { gap: 24px; padding-left: 24px; }

        .topic-branch { position: relative; display: flex; flex-direction: column; }

        .connector-path {
          position: absolute;
          left: -60px;
          top: -56px;
          bottom: 50%;
          width: 60px;
        }

        .sidebar .connector-path { left: -24px; width: 24px; top: -24px; }

        .path-vertical {
          position: absolute;
          left: 0; top: 0; bottom: 0; width: 2px;
          background: linear-gradient(to bottom, rgba(99, 102, 241, 0.3), rgba(99, 102, 241, 0.05));
        }

        .path-horizontal {
          position: absolute;
          left: 0; bottom: 0; width: 60px; height: 2px;
          background: rgba(99, 102, 241, 0.15);
        }

        .sidebar .path-horizontal { width: 24px; }

        .topic-node {
          width: 100%;
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 24px 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          backdrop-filter: blur(10px);
        }

        .sidebar .topic-node { padding: 16px 20px; border-radius: 16px; }

        .topic-branch.active .topic-node {
          border-color: #6366f1;
          background: rgba(99, 102, 241, 0.12);
          box-shadow: 0 0 30px rgba(99, 102, 241, 0.15);
          transform: scale(1.02);
        }

        .topic-node:hover {
          background: rgba(30, 41, 59, 0.7);
          border-color: rgba(99, 102, 241, 0.4);
          transform: translateY(-4px) scale(1.01);
        }

        .topic-content { display: flex; align-items: center; gap: 24px; }
        .sidebar .topic-content { gap: 16px; }

        .topic-index {
          width: 48px; height: 48px;
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.2);
          border-radius: 16px;
          display: flex; align-items: center; justify-content: center;
          color: #818cf8; font-weight: 800; font-size: 1.125rem; flex-shrink: 0;
        }

        .sidebar .topic-index { width: 36px; height: 36px; font-size: 0.9rem; border-radius: 10px; }

        .topic-text h3 { font-size: 1.25rem; font-weight: 700; margin-bottom: 4px; color: #f8fafc; }
        .sidebar .topic-text h3 { font-size: 1rem; }
        .topic-text p { color: #64748b; font-size: 0.9375rem; font-weight: 500; }

        .topic-action {
          width: 44px; height: 44px; border-radius: 14px;
          display: flex; align-items: center; justify-content: center;
          color: #64748b; background: rgba(255, 255, 255, 0.03);
          transition: all 0.3s; flex-shrink: 0;
        }

        .topic-node:hover .topic-action, .topic-branch.active .topic-action {
          background: #6366f1; color: white; transform: rotate(90deg);
        }

        .subtopics-list {
          padding-left: 104px; display: flex; flex-wrap: wrap; gap: 12px; margin-top: 20px;
        }

        .subtopic-item {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 10px 20px; border-radius: 99px;
          display: flex; align-items: center; gap: 10px;
          font-size: 0.875rem; color: #94a3b8; font-weight: 500;
        }

        .subtopic-dot { width: 6px; height: 6px; border-radius: 50%; background: #475569; }

        /* Tutor Column */
        .tutor-column {
          width: 65%; display: flex; flex-direction: column;
          background: #020617; border-left: 1px solid rgba(255, 255, 255, 0.08);
          position: relative;
        }

        .tutor-header {
          padding: 20px 28px; background: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(20px); border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          display: flex; align-items: center; justify-content: space-between;
        }

        .tutor-info { display: flex; align-items: center; gap: 16px; }

        .tutor-avatar {
          width: 48px; height: 48px;
          background: linear-gradient(135deg, #6366f1, #ec4899);
          border-radius: 14px; display: flex; align-items: center; justify-content: center;
          color: white; box-shadow: 0 10px 20px -5px rgba(99, 102, 241, 0.4);
        }

        .tutor-name { font-weight: 800; font-size: 1.125rem; color: white; }
        .tutor-status { font-size: 0.8125rem; color: #64748b; font-weight: 500; }

        .subtopic-panel {
          padding: 16px 28px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          background: rgba(10,15,30,0.5);
          max-height: 200px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.08) transparent;
        }
        .subtopic-panel-title {
          display: flex; align-items: center; gap: 6px;
          font-size: 0.7rem; font-weight: 700; color: #475569;
          text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px;
        }
        .subtopic-panel-list { display: flex; flex-direction: column; gap: 6px; }
        .subtopic-conf-item {
          display: flex; flex-direction: column; gap: 4px;
          padding: 8px 10px; border-radius: 8px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.04);
          transition: background 0.2s;
        }
        .subtopic-conf-item.mastered { border-color: rgba(16,185,129,0.2); background: rgba(16,185,129,0.04); }
        .subtopic-conf-name { font-size: 0.8rem; color: #cbd5e1; font-weight: 500; }
        .subtopic-conf-bar-row { display: flex; align-items: center; gap: 8px; }
        .subtopic-conf-bar { flex: 1; height: 4px; background: rgba(255,255,255,0.06); border-radius: 4px; overflow: hidden; }
        .subtopic-conf-fill { height: 100%; border-radius: 4px; transition: width 0.6s ease; }
        .subtopic-badge { font-size: 0.75rem; }
        .subtopic-pct { font-size: 0.72rem; font-weight: 700; min-width: 28px; text-align: right; }

        .chat-messages {
          flex: 1; overflow-y: auto; padding: 32px;
          display: flex; flex-direction: column; gap: 32px;
          scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent;
        }

        .message-wrapper { display: flex; gap: 20px; max-width: 90%; }
        .message-wrapper.user { align-self: flex-end; flex-direction: row-reverse; }

        .message-icon {
          width: 36px; height: 36px; border-radius: 10px;
          background: rgba(255, 255, 255, 0.05); display: flex; align-items: center;
          justify-content: center; flex-shrink: 0; color: #94a3b8;
        }

        .assistant .message-icon { background: rgba(99, 102, 241, 0.15); color: #818cf8; }

        .message-bubble { padding: 16px 24px; border-radius: 20px; font-size: 1rem; line-height: 1.7; }
        .assistant .message-bubble { background: rgba(30, 41, 59, 0.4); border: 1px solid rgba(255, 255, 255, 0.05); color: #e2e8f0; }
        .user .message-bubble { background: linear-gradient(135deg, #6366f1, #4f46e5); color: white; border-bottom-right-radius: 4px; }

        .chat-input-area { padding: 32px; background: linear-gradient(to top, #020617, transparent); }

        .input-container {
          background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px; padding: 10px 10px 10px 24px;
          display: flex; align-items: center; gap: 16px;
          backdrop-filter: blur(10px); transition: all 0.3s;
        }

        .input-container:focus-within { border-color: rgba(99, 102, 241, 0.5); background: rgba(30, 41, 59, 0.8); }

        .input-container input { flex: 1; background: none; border: none; color: white; font-size: 1rem; padding: 12px 0; outline: none; }
        .send-btn { width: 48px; height: 48px; background: #6366f1; color: white; border: none; border-radius: 14px; cursor: pointer; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .send-btn:hover:not(.disabled) { background: #4f46e5; transform: scale(1.1) rotate(-5deg); }

        .typing-indicator {
          display: flex; gap: 6px; padding: 16px 24px;
          background: rgba(30, 41, 59, 0.4); border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 20px; width: fit-content; margin-left: 56px;
        }
        .typing-indicator span {
          width: 8px; height: 8px; background: #818cf8; border-radius: 50%;
          animation: bounce 1.4s infinite ease-in-out both;
        }
        .typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
        .typing-indicator span:nth-child(2) { animation-delay: -0.16s; }
        
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); opacity: 0.3; }
          40% { transform: scale(1); opacity: 1; }
        }

        /* Enhanced Diagnostic Modal */
        .modal-overlay {
          position: fixed; inset: 0; background: rgba(2, 6, 23, 0.85);
          backdrop-filter: blur(12px); display: flex; align-items: center;
          justify-content: center; z-index: 100; padding: 24px;
        }

        .diagnostic-modal {
          background: #0f172a;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 32px; padding: 48px;
          max-width: 540px; width: 100%;
          text-align: center; position: relative;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          overflow: hidden;
        }

        .modal-glow {
          position: absolute; top: -50%; left: -50%; width: 200%; height: 200%;
          background: radial-gradient(circle at center, rgba(99, 102, 241, 0.08) 0%, transparent 40%);
          pointer-events: none;
        }

        .modal-icon-wrapper {
          position: relative; width: 100px; height: 100px; margin: 0 auto 32px;
        }

        .modal-icon {
          position: relative; width: 100%; height: 100%;
          background: linear-gradient(135deg, #6366f1, #a855f7);
          border-radius: 30px; display: flex; align-items: center;
          justify-content: center; color: white; z-index: 2;
          box-shadow: 0 15px 30px -5px rgba(99, 102, 241, 0.4);
        }

        .icon-rings .ring {
          position: absolute; inset: -10px; border: 1px solid rgba(99, 102, 241, 0.2);
          border-radius: 40px; animation: orbit 4s linear infinite;
        }

        .icon-rings .ring:nth-child(2) { inset: -20px; animation-duration: 6s; opacity: 0.5; }

        @keyframes orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .modal-title { font-size: 2rem; font-weight: 900; margin-bottom: 16px; color: white; letter-spacing: -0.02em; }
        .modal-desc { font-size: 1.0625rem; color: #94a3b8; line-height: 1.6; margin-bottom: 40px; }
        .modal-desc strong { color: #f1f5f9; font-weight: 700; }

        .modal-features {
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 16px; margin-bottom: 48px;
        }

        .feature-item {
          background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 16px 12px; border-radius: 20px; display: flex; flex-direction: column;
          align-items: center; gap: 12px; transition: all 0.3s;
        }

        .feature-item:hover { background: rgba(255, 255, 255, 0.05); transform: translateY(-4px); border-color: rgba(99, 102, 241, 0.3); }

        .feature-icon {
          width: 36px; height: 36px; background: rgba(99, 102, 241, 0.1);
          border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #818cf8;
        }

        .feature-text { display: flex; flex-direction: column; gap: 2px; }
        .feature-label { font-size: 0.75rem; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
        .feature-val { font-size: 0.875rem; color: #e2e8f0; font-weight: 700; }

        .modal-actions { display: flex; gap: 16px; }

        .btn-skip {
          flex: 1; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1);
          color: #94a3b8; padding: 16px; border-radius: 16px; font-weight: 700;
          cursor: pointer; transition: all 0.3s;
        }

        .btn-skip:hover { background: rgba(255, 255, 255, 0.08); color: white; }

        .btn-start {
          flex: 2; background: linear-gradient(135deg, #6366f1, #4f46e5); border: none;
          color: white; padding: 16px; border-radius: 16px; font-weight: 800;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          cursor: pointer; transition: all 0.3s;
          box-shadow: 0 10px 20px -5px rgba(99, 102, 241, 0.5);
        }

        .btn-start:hover { transform: translateY(-2px); box-shadow: 0 15px 30px -5px rgba(99, 102, 241, 0.6); }

        .close-modal {
          position: absolute; top: 24px; right: 24px; background: none; border: none;
          color: #475569; cursor: pointer; transition: all 0.2s;
        }

        .close-modal:hover { color: #f8fafc; transform: rotate(90deg); }

        @keyframes pulse { 0% { transform: scale(1); opacity: 0.5; } 100% { transform: scale(1.1); opacity: 0; } }
        @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1.0); } }
        @keyframes pop { 0% { transform: scale(0.9); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        .animate-pop { animation: pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }
        @keyframes bounceIn {
          from { opacity: 0; transform: scale(0.9) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
