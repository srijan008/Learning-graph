import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Palette, Eraser, Trash2, ArrowLeft, Download, MousePointer2, Layers, Sparkles, Save, Plus, History, ChevronRight } from 'lucide-react';

const API = 'http://127.0.0.1:8002/api/v1';
const USER = 'user_123';

interface Topic {
  id: string;
  title: string;
  description: string;
  image_prompt: string;
}

interface SavedSketch {
  id: string;
  name: string;
  created_at: string;
  data: any;
}

interface SketchpadVisualizerProps {
  data: {
    topics: Topic[];
    error?: boolean;
  };
}

const SketchpadVisualizer = ({ data }: SketchpadVisualizerProps) => {
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#6366f1');
  const [brushSize, setBrushSize] = useState(4);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [showImage, setShowImage] = useState(true);
  const [loadingAI, setLoadingAI] = useState(false);
  const [showInfoInput, setShowInfoInput] = useState(false);
  const [infoQuery, setInfoQuery] = useState('');
  
  const [savedSketches, setSavedSketches] = useState<SavedSketch[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Storage for all commands to allow saving/reloading
  const [allCommands, setAllCommands] = useState<any[]>([]);
  const [userStrokes, setUserStrokes] = useState<any[]>([]);

  const fetchHistory = useCallback(async () => {
    if (!selectedTopic) return;
    try {
      const r = await axios.get(`${API}/graph/topic/${selectedTopic.id}/sketches?user_id=${USER}`);
      setSavedSketches(r.data.sketches || []);
    } catch (e) {
      console.error("Failed to fetch sketches:", e);
    }
  }, [selectedTopic]);

  useEffect(() => {
    if (selectedTopic) {
      fetchHistory();
      // Only load AI sketch if it's a "fresh" start and no saved sketches exist or user clicks "+"
      // For now, let's just fetch history and let the user decide.
    }
  }, [selectedTopic, fetchHistory]);

  const loadAISketch = async () => {
    if (!selectedTopic) return;
    setLoadingAI(true);
    try {
      const r = await axios.get(`${API}/graph/topic/${selectedTopic.id}/ai-sketch`);
      if (r.data.commands) {
        setAllCommands(prev => [...prev, ...r.data.commands]);
        animateSketch(r.data.commands);
      }
    } catch (e) {
      console.error("AI Sketch failed:", e);
    }
    setLoadingAI(false);
  };

  const generateInfographic = async () => {
    if (!infoQuery) return;
    setLoadingAI(true);
    setShowInfoInput(false);
    try {
      const r = await axios.post(`${API}/graph/ai-infographic`, { query: infoQuery });
      if (r.data.commands) {
        // Adjust Y positions to avoid clutter - start drawing below existing content
        const maxY = allCommands.reduce((max, cmd) => Math.max(max, cmd.y || cmd.y2 || 0), 0);
        const startY = maxY > 0 ? maxY + 100 : 0;
        
        const adjustedCommands = r.data.commands.map((cmd: any) => ({
          ...cmd,
          y: cmd.y !== undefined ? cmd.y + startY : undefined,
          y1: cmd.y1 !== undefined ? cmd.y1 + startY : undefined,
          y2: cmd.y2 !== undefined ? cmd.y2 + startY : undefined,
        }));

        setAllCommands(prev => [...prev, ...adjustedCommands]);
        animateSketch(adjustedCommands, 20);
        
        // Auto-scroll to new content
        if (containerRef.current) {
          containerRef.current.scrollTo({ top: startY, behavior: 'smooth' });
        }
      }
    } catch (e) {
      console.error("Infographic failed:", e);
    }
    setLoadingAI(false);
  };

  const animateSketch = (commands: any[], delay = 50) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let i = 0;
    const drawNext = () => {
      if (i >= commands.length) return;
      const cmd = commands[i++];
      
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = cmd.color || '#94a3b8';
      ctx.fillStyle = cmd.color || '#94a3b8';
      ctx.lineWidth = cmd.lineWidth || 2;

      if (cmd.type === 'line') {
        ctx.beginPath();
        ctx.moveTo(cmd.x1, cmd.y1);
        ctx.lineTo(cmd.x2, cmd.y2);
        ctx.stroke();
      } else if (cmd.type === 'circle') {
        ctx.beginPath();
        ctx.arc(cmd.x, cmd.y, cmd.r, 0, Math.PI * 2);
        if (cmd.fill) ctx.fill();
        else ctx.stroke();
      } else if (cmd.type === 'rect') {
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(cmd.x, cmd.y, cmd.w, cmd.h, 12);
        } else {
            ctx.rect(cmd.x, cmd.y, cmd.w, cmd.h);
        }
        if (cmd.fill) ctx.fill();
        ctx.stroke();
      } else if (cmd.type === 'text') {
        ctx.font = `${cmd.size > 24 ? '800' : '500'} ${cmd.size || 16}px Inter, system-ui, sans-serif`;
        ctx.fillText(cmd.text, cmd.x, cmd.y);
      }

      setTimeout(drawNext, delay);
    };
    drawNext();
  };

  const handleSave = async () => {
    if (!selectedTopic || isSaving) return;
    setIsSaving(true);
    try {
      const payload = {
        user_id: USER,
        name: `Sketch ${new Date().toLocaleTimeString()}`,
        data: {
          commands: allCommands,
          strokes: userStrokes
        }
      };
      await axios.post(`${API}/graph/topic/${selectedTopic.id}/sketch`, payload);
      await fetchHistory();
      alert("Sketch saved successfully!");
    } catch (e) {
      console.error("Save failed:", e);
      alert("Failed to save sketch.");
    }
    setIsSaving(false);
  };

  const loadSavedSketch = (sketch: SavedSketch) => {
    clearCanvas();
    setAllCommands(sketch.data.commands || []);
    setUserStrokes(sketch.data.strokes || []);
    
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    // Draw all commands instantly
    [...(sketch.data.commands || []), ...(sketch.data.strokes || [])].forEach(cmd => {
      ctx.globalCompositeOperation = cmd.operation || 'source-over';
      ctx.strokeStyle = cmd.color;
      ctx.fillStyle = cmd.color;
      ctx.lineWidth = cmd.lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (cmd.type === 'line') {
        ctx.beginPath();
        ctx.moveTo(cmd.x1, cmd.y1);
        ctx.lineTo(cmd.x2, cmd.y2);
        ctx.stroke();
      } else if (cmd.type === 'circle') {
        ctx.beginPath();
        ctx.arc(cmd.x, cmd.y, cmd.r, 0, Math.PI * 2);
        if (cmd.fill) ctx.fill();
        else ctx.stroke();
      } else if (cmd.type === 'rect') {
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(cmd.x, cmd.y, cmd.w, cmd.h, 12);
        else ctx.rect(cmd.x, cmd.y, cmd.w, cmd.h);
        if (cmd.fill) ctx.fill();
        ctx.stroke();
      } else if (cmd.type === 'text') {
        ctx.font = `${cmd.size > 24 ? '800' : '500'} ${cmd.size || 16}px Inter, system-ui, sans-serif`;
        ctx.fillText(cmd.text, cmd.x, cmd.y);
      } else if (cmd.type === 'path') {
        ctx.beginPath();
        ctx.moveTo(cmd.points[0].x, cmd.points[0].y);
        cmd.points.forEach((p: any) => ctx.lineTo(p.x, p.y));
        ctx.stroke();
      }
    });
    setShowHistory(false);
  };

  const startNewSketch = () => {
    if (window.confirm("Start a new sketch? Current unsaved work will be lost.")) {
      clearCanvas();
      setAllCommands([]);
      setUserStrokes([]);
      loadAISketch();
    }
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const pos = getPos(e);
    const newStroke = {
      type: 'path',
      color,
      lineWidth: tool === 'eraser' ? brushSize * 8 : brushSize,
      operation: tool === 'eraser' ? 'destination-out' : 'source-over',
      points: [pos]
    };
    setUserStrokes(prev => [...prev, newStroke]);
    draw(e, true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const ctx = canvasRef.current?.getContext('2d');
    ctx?.beginPath(); 
  };

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = ('touches' in e) ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = ('touches' in e) ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const draw = (e: React.MouseEvent | React.TouchEvent, isFirst = false) => {
    if (!isDrawing && !isFirst) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const pos = getPos(e);

    ctx.lineWidth = tool === 'eraser' ? brushSize * 8 : brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
    }

    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);

    if (!isFirst) {
      setUserStrokes(prev => {
        const last = prev[prev.length - 1];
        if (last && last.type === 'path') {
          return [...prev.slice(0, -1), { ...last, points: [...last.points, pos] }];
        }
        return prev;
      });
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  if (!selectedTopic) {
    return (
      <div style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'white', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <MousePointer2 size={20} color="#6366f1" /> Select Concept to Visualize
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {data?.error && (
            <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '24px', border: '1px dashed rgba(239, 68, 68, 0.2)' }}>
              <Sparkles size={32} color="#ef4444" style={{ marginBottom: 16 }} />
              <div style={{ color: '#fca5a5', fontWeight: 700 }}>Revision content not available for this chapter.</div>
              <div style={{ color: '#991b1b', fontSize: '0.8rem', marginTop: 8 }}>Please try a different mode or chapter.</div>
            </div>
          )}
          {!data?.error && data?.topics?.map((topic) => (
            <button
              key={topic.id}
              onClick={() => setSelectedTopic(topic)}
              style={{
                padding: '28px',
                borderRadius: '24px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                overflow: 'hidden'
              }}
              onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.3)';
              }}
              onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
              }}
            >
              <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'white', marginBottom: '10px' }}>{topic.title}</div>
              <div style={{ color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.5 }}>{topic.description}</div>
              <div style={{ position: 'absolute', bottom: -10, right: -10, opacity: 0.05 }}>
                  <Palette size={80} />
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '85vh', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px' }}>
        <div style={{ display:'flex', gap:10 }}>
          <button
            onClick={() => setSelectedTopic(null)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.05)', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 700, transition: 'all 0.2s' }}
          >
            <ArrowLeft size={18} /> Exit
          </button>
          <button
            onClick={startNewSketch}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', color: '#10b981', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 700 }}
          >
            <Plus size={18} /> New
          </button>
        </div>

        <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'white' }}>{selectedTopic.title}</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Scrollable Infinite Canvas</div>
        </div>

        <div style={{ display:'flex', gap:10 }}>
          <button
            onClick={() => setShowHistory(!showHistory)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', color: '#f59e0b', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 700 }}
          >
            <History size={18} /> History ({savedSketches.length})
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '12px', background: isSaving ? 'gray' : 'linear-gradient(135deg, #6366f1, #4f46e5)', border: 'none', color: 'white', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 700, boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)' }}
          >
            <Save size={18} /> {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: '24px', overflow: 'hidden' }}>
        {/* Advanced Toolbar */}
        <div style={{ width: '80px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'rgba(15, 23, 42, 0.8)', padding: '16px', borderRadius: '24px', border: '1px solid rgba(255, 255, 255, 0.1)', alignItems: 'center', backdropFilter: 'blur(20px)' }}>
          <button
            onClick={() => setTool('pen')}
            style={{ width: '48px', height: '48px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: tool === 'pen' ? color : 'rgba(255,255,255,0.03)', border: 'none', cursor: 'pointer', color: tool === 'pen' ? 'white' : '#94a3b8', transition: 'all 0.2s' }}
          >
            <Palette size={22} />
          </button>
          <button
            onClick={() => setTool('eraser')}
            style={{ width: '48px', height: '48px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: tool === 'eraser' ? '#ef4444' : 'rgba(255,255,255,0.03)', border: 'none', cursor: 'pointer', color: tool === 'eraser' ? 'white' : '#94a3b8', transition: 'all 0.2s' }}
          >
            <Eraser size={22} />
          </button>
          
          <div style={{ width: '30px', height: '1px', background: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />
          
          <button
            onClick={() => setShowImage(!showImage)}
            style={{ width: '48px', height: '48px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: showImage ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.03)', border: showImage ? '1px solid #10b981' : 'none', cursor: 'pointer', color: showImage ? '#10b981' : '#94a3b8', transition: 'all 0.2s' }}
            title="Toggle Reference Background"
          >
            <Layers size={22} />
          </button>

          <button
            onClick={() => setShowInfoInput(!showInfoInput)}
            style={{ width: '48px', height: '48px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: showInfoInput ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.03)', border: showInfoInput ? '1px solid #f59e0b' : 'none', cursor: 'pointer', color: showInfoInput ? '#f59e0b' : '#94a3b8', transition: 'all 0.2s' }}
            title="Generate Concept Infographic"
          >
            <MousePointer2 size={22} />
          </button>

          <button
            onClick={loadAISketch}
            disabled={loadingAI}
            style={{ width: '48px', height: '48px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: loadingAI ? 'rgba(168, 85, 247, 0.15)' : 'rgba(255,255,255,0.03)', border: loadingAI ? '1px solid #a855f7' : 'none', cursor: 'pointer', color: loadingAI ? '#a855f7' : '#94a3b8', transition: 'all 0.2s' }}
            title="AI Reference Sketch"
          >
            <Sparkles size={22} />
          </button>

          <button
            onClick={clearCanvas}
            style={{ width: '48px', height: '48px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.03)', border: 'none', cursor: 'pointer', color: '#94a3b8', transition: 'all 0.2s' }}
          >
            <Trash2 size={22} />
          </button>

          <div style={{ flex: 1 }} />
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700 }}>SIZE</div>
            <input 
                type="range" min="1" max="20" value={brushSize} 
                onChange={(e) => setBrushSize(parseInt(e.target.value))}
                style={{ width: '40px', accentColor: color }}
            />
          </div>

          <div style={{ position: 'relative', width: '32px', height: '32px', borderRadius: '50%', background: color, border: '2px solid white', cursor: 'pointer', overflow: 'hidden' }}>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={{ position: 'absolute', top: -5, left: -5, width: '50px', height: '50px', opacity: 0, cursor: 'pointer' }}
            />
          </div>
        </div>

        {/* Interactive Workspace */}
        <div ref={containerRef} style={{ flex: 1, position: 'relative', background: '#0a0f1d', borderRadius: '32px', border: '1px solid rgba(255, 255, 255, 0.08)', overflowY: 'auto', boxShadow: 'inset 0 0 100px rgba(0,0,0,0.5)', scrollbarWidth:'thin' }}>
          
          {/* Reference Image Layer */}
          {showImage && (
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', padding: '100px 40px', textAlign: 'center', opacity: 0.1, pointerEvents: 'none' }}>
                <div style={{ fontSize: '10rem' }}>🎨</div>
                <div style={{ fontSize: '3rem', fontWeight: 900, color: 'white', marginTop: 40 }}>{selectedTopic.title}</div>
                <div style={{ color: '#94a3b8', fontSize: '1.2rem', marginTop: 20 }}>Interactive Visualization Canvas</div>
            </div>
          )}

          {/* Sketch Layer - Very Tall for Scrolling */}
          <canvas
            ref={canvasRef}
            width={1600}
            height={4000}
            onMouseDown={startDrawing}
            onMouseUp={stopDrawing}
            onMouseOut={stopDrawing}
            onMouseMove={draw}
            onTouchStart={startDrawing}
            onTouchEnd={stopDrawing}
            onTouchMove={draw}
            style={{ width: '100%', height: 'auto', cursor: tool === 'pen' ? 'crosshair' : 'default', touchAction: 'none', position: 'relative', zIndex: 5 }}
          />

          {/* Floating UI */}
          <div style={{ position: 'fixed', bottom: 40, right: 380, display: 'flex', gap: '10px', zIndex: 10 }}>
              <div style={{ padding: '10px 20px', borderRadius: '14px', background: 'rgba(15, 23, 42, 0.9)', color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700, border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>
                Tool: <span style={{ color: tool === 'pen' ? color : '#ef4444' }}>{tool.toUpperCase()}</span>
              </div>
          </div>

          {/* History Sidebar */}
          {showHistory && (
            <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '300px', background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(20px)', borderLeft: '1px solid rgba(255,255,255,0.1)', zIndex: 100, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0, color: 'white' }}>Saved Sketches</h4>
                <button onClick={() => setShowHistory(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><ChevronRight size={20}/></button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {savedSketches.map(s => (
                  <button key={s.id} onClick={() => loadSavedSketch(s)}
                    style={{ padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                  >
                    <div style={{ color: 'white', fontWeight: 700, fontSize: '0.9rem', marginBottom: '4px' }}>{s.name}</div>
                    <div style={{ color: '#64748b', fontSize: '0.7rem' }}>{new Date(s.created_at).toLocaleString()}</div>
                  </button>
                ))}
                {savedSketches.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: '#475569', fontSize: '0.8rem' }}>No sketches saved yet.</div>}
              </div>
            </div>
          )}

          {/* Infographic Input Overlay */}
          {showInfoInput && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
              <div style={{ background: '#1e293b', padding: '32px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)', width: '400px', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
                <div>
                  <h4 style={{ color: 'white', fontSize: '1.2rem', fontWeight: 800, marginBottom: '8px' }}>Add Concept Infographic</h4>
                  <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>This will be added below your current work.</p>
                </div>
                <input
                  autoFocus
                  type="text"
                  value={infoQuery}
                  onChange={(e) => setInfoQuery(e.target.value)}
                  placeholder="e.g. Krebs Cycle, DNA Structure..."
                  onKeyDown={(e) => e.key === 'Enter' && generateInfographic()}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '12px 16px', color: 'white', fontSize: '1rem', outline: 'none' }}
                />
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={() => setShowInfoInput(false)} style={{ flex: 1, padding: '12px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                  <button onClick={generateInfographic} style={{ flex: 1, padding: '12px', borderRadius: '12px', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', border: 'none', color: 'white', cursor: 'pointer', fontWeight: 700 }}>Generate</button>
                </div>
              </div>
            </div>
          )}

          {/* AI Thinking Loader Overlay */}
          {loadingAI && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(10, 15, 29, 0.8)', backdropFilter: 'blur(15px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', inset: -20, background: 'radial-gradient(circle, rgba(99, 102, 241, 0.3) 0%, transparent 70%)', filter: 'blur(20px)', animation: 'pulse 2s infinite' }} />
                  <div style={{ width: 80, height: 80, borderRadius: '24px', background: 'linear-gradient(135deg, #6366f1, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', boxShadow: '0 0 40px rgba(99, 102, 241, 0.5)' }}>
                    <Sparkles size={40} color="white" style={{ animation: 'bounce 2s infinite' }} />
                  </div>
                </div>
                <div>
                  <h3 style={{ color: 'white', fontSize: '1.25rem', fontWeight: 800, margin: '0 0 8px 0' }}>AI is Visualizing...</h3>
                  <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    Generating complex infographic commands <div style={{ display: 'flex', gap: 3 }}><div style={{ width: 4, height: 4, background: '#6366f1', borderRadius: '50%', animation: 'pulse 1s infinite' }} /><div style={{ width: 4, height: 4, background: '#6366f1', borderRadius: '50%', animation: 'pulse 1s infinite', animationDelay: '0.2s' }} /><div style={{ width: 4, height: 4, background: '#6366f1', borderRadius: '50%', animation: 'pulse 1s infinite', animationDelay: '0.4s' }} /></div>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SketchpadVisualizer;

const styles = `
  @keyframes pulse {
    0%, 100% { opacity: 0.5; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.05); }
  }
  @keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
  }
`;

if (typeof document !== 'undefined') {
  const styleSheet = document.createElement("style");
  styleSheet.innerText = styles;
  document.head.appendChild(styleSheet);
}
