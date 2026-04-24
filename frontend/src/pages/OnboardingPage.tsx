import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  GraduationCap, 
  BookOpen, 
  Atom, 
  Binary, 
  Microscope, 
  Calculator,
  ChevronRight,
  Sparkles,
  Lock
} from 'lucide-react';

const GOALS = [
  { id: 'jee', name: 'Jee Prep', icon: Binary, color: '#3b82f6', available: false, description: 'Crack JEE with strong PCM fundamentals' },
  { id: 'neet', name: 'NEET Prep', icon: Microscope, color: '#ef4444', available: true, description: 'Master Biology with NEET-focused prep' },
  { id: 'boards', name: 'Board Exams', icon: BookOpen, color: '#8b5cf6', available: false, description: 'Score higher with focused revision' },
];

const TUTORS = [
  { name: 'Mohit Tyagi', subject: 'JEE • JEE Physics • Grade 9-12', rating: 4.8, image: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&q=80&w=200&h=200' },
  { name: 'Harshita Dua', subject: 'JEE • JEE Chemistry • Grade 9-12', rating: 4.9, image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200&h=200' },
  { name: 'Neha Garg', subject: 'Mathematics • Maths • Grade 1-4', rating: 4.7, image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=200&h=200' },
];

const TOOLS = [
  { name: 'Podcast Generator', icon: '🎙️' },
  { name: 'Flashcard Generator', icon: '🃏' },
  { name: 'Simulation Generator', icon: '🔬' },
  { name: 'Flashcard Generator', icon: '🃏' },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);

  const handleSelectGoal = (goalId: string) => {
    const goal = GOALS.find(g => g.id === goalId);
    if (!goal?.available) return;
    
    setSelectedGoal(goalId);
    localStorage.setItem('selected_goal', goalId);
    navigate('/journey/new');
  };

  return (
    <div className="onboarding-container">
      <div className="onboarding-content">
        <header className="main-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '1.5rem', fontWeight: 900, color: 'white' }}>Arihant</span>
            <div className="powered-badge">Powered by YoLearn.ai</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, color: '#94a3b8' }}>
             <div style={{ display:'flex', alignItems:'center', gap:8 }}><span style={{ color:'#fbbf24' }}>🟡</span> 5321 Credits</div>
             <div>Refer 🔗</div>
             <div>🔔</div>
             <div style={{ width:32, height:32, borderRadius:'50%', background:'#1e293b' }}></div>
          </div>
        </header>

        <div className="hero-section">
          <div className="hero-text">
            <div style={{ color: '#94a3b8', fontSize: '1rem', marginBottom: 8 }}>Hello Kirti Prakash</div>
            <h1 style={{ fontSize: '3.5rem', fontWeight: 800, color: '#2dd4bf', margin: '0 0 8px 0' }}>Crack Your Goal</h1>
            <h2 style={{ fontSize: '2.5rem', fontWeight: 700, color: 'white', margin: 0 }}>with a Structured Plan</h2>
            <p style={{ color: '#94a3b8', fontSize: '1.1rem', marginTop: 24, maxWidth: 600 }}>
              Choose your Goal, follow a clear roadmap, and improve daily with the right tutors and tools
            </p>
          </div>
          <div className="hero-image">
             {/* Mock visual element */}
             <div style={{ width: '100%', height: 300, borderRadius: 24, background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(16,185,129,0.2))', border: '1px solid rgba(255,255,255,0.05)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', bottom: 20, left: 20, background: 'rgba(15,23,42,0.8)', padding: 16, borderRadius: 16, border: '1px solid rgba(255,255,255,0.1)' }}>
                   <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>NEET Target 2025</div>
                   <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'white' }}>8/32 Topics Completed</div>
                   <div style={{ width: 150, height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, marginTop: 8 }}>
                      <div style={{ width: '54%', height: '100%', background: '#2dd4bf', borderRadius: 3 }}></div>
                   </div>
                </div>
             </div>
          </div>
        </div>

        <section className="section">
          <h3 className="section-title">Choose Your Goal</h3>
          <div className="goals-grid">
            {GOALS.map((goal, idx) => (
              <div 
                key={idx}
                className={`goal-card ${selectedGoal === goal.id ? 'selected' : ''} ${!goal.available ? 'disabled' : ''}`}
                onClick={() => handleSelectGoal(goal.id)}
                style={{ borderColor: goal.available ? `${goal.color}40` : 'rgba(255,255,255,0.05)' }}
              >
                <div className="goal-icon-wrapper" style={{ background: `${goal.color}20`, color: goal.color }}>
                  <goal.icon size={24} />
                </div>
                <div className="goal-info">
                  <h3>{goal.name}</h3>
                  <p>{goal.description}</p>
                </div>
                {!goal.available && <div className="lock-overlay"><Lock size={16} /></div>}
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <h3 className="section-title">Top Tutor by Subject</h3>
          <div className="tutors-grid">
            {TUTORS.map((tutor, idx) => (
              <div key={idx} className="tutor-card">
                <img src={tutor.image} alt={tutor.name} className="tutor-image" />
                <div className="tutor-info">
                   <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                      <h4 style={{ margin:0, color:'white', fontSize:'1rem' }}>{tutor.name}</h4>
                      <div style={{ fontSize:'0.8rem', color:'#fbbf24' }}>⭐ {tutor.rating}</div>
                   </div>
                   <p style={{ margin:'4px 0 16px', color:'#64748b', fontSize:'0.75rem' }}>{tutor.subject}</p>
                   <div style={{ display:'flex', gap:8 }}>
                      <button className="tutor-btn-secondary">Study Now</button>
                      <button className="tutor-btn-primary">Start Session</button>
                   </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <h3 className="section-title">Tools</h3>
          <div className="tools-grid">
            {TOOLS.map((tool, idx) => (
              <div key={idx} className="tool-card">
                 <span style={{ fontSize:'1.5rem' }}>{tool.icon}</span>
                 <span style={{ color:'white', fontWeight:600, fontSize:'0.9rem' }}>{tool.name}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <style>{`
        .onboarding-container {
          min-height: 100vh;
          background: #020617;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 0;
          overflow-y: auto;
          font-family: 'Inter', sans-serif;
        }

        .onboarding-content {
          max-width: 1200px;
          width: 100%;
          padding: 32px;
          animation: slideUp 0.6s ease-out;
        }

        .main-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 64px;
        }

        .powered-badge {
          background: rgba(45, 212, 191, 0.1);
          color: #2dd4bf;
          font-size: 0.7rem;
          padding: 4px 10px;
          border-radius: 99px;
          border: 1px solid rgba(45, 212, 191, 0.2);
          font-weight: 700;
        }

        .hero-section {
          display: grid;
          grid-template-columns: 1fr 450px;
          gap: 48px;
          align-items: center;
          margin-bottom: 80px;
        }

        .section {
          margin-bottom: 64px;
        }

        .section-title {
          font-size: 1.25rem;
          font-weight: 800;
          color: white;
          margin-bottom: 24px;
        }

        .goals-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 20px;
        }

        .goal-card {
          position: relative;
          background: rgba(30, 41, 59, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 20px;
          padding: 24px;
          display: flex;
          align-items: center;
          gap: 16px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .goal-card:hover:not(.disabled) {
          background: rgba(30, 41, 59, 0.6);
          transform: translateY(-2px);
        }

        .goal-card.disabled {
          opacity: 0.5;
          cursor: default;
        }

        .goal-card.selected {
          border-color: #2dd4bf !important;
          background: rgba(45, 212, 191, 0.05);
        }

        .goal-icon-wrapper {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .goal-info h3 {
          margin: 0 0 4px 0;
          color: white;
          font-size: 1.1rem;
          font-weight: 700;
        }

        .goal-info p {
          margin: 0;
          color: #64748b;
          font-size: 0.8rem;
          line-height: 1.4;
        }

        .lock-overlay {
          position: absolute;
          top: 12px;
          right: 12px;
          color: #475569;
        }

        .tutors-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
          gap: 20px;
        }

        .tutor-card {
          background: rgba(30, 41, 59, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 20px;
          padding: 20px;
          display: flex;
          gap: 16px;
        }

        .tutor-image {
          width: 80px;
          height: 80px;
          border-radius: 16px;
          object-fit: cover;
        }

        .tutor-btn-primary {
          flex: 1;
          background: white;
          color: black;
          border: none;
          padding: 8px;
          border-radius: 10px;
          font-weight: 700;
          font-size: 0.8rem;
          cursor: pointer;
        }

        .tutor-btn-secondary {
          flex: 1;
          background: rgba(255,255,255,0.05);
          color: white;
          border: 1px solid rgba(255,255,255,0.1);
          padding: 8px;
          border-radius: 10px;
          font-weight: 700;
          font-size: 0.8rem;
          cursor: pointer;
        }

        .tools-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 16px;
        }

        .tool-card {
          background: rgba(30, 41, 59, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          padding: 20px;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 900px) {
          .hero-section { grid-template-columns: 1fr; gap: 32px; }
          .hero-image { display: none; }
        }
      `}</style>
    </div>
  );
}
