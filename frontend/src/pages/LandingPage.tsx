import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Sparkles, 
  Brain, 
  Target, 
  Zap, 
  ChevronRight, 
  Mail, 
  Lock, 
  X, 
  ArrowRight,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';

export default function LandingPage() {
  const navigate = useNavigate();
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // Simulate login
    setTimeout(() => {
      setIsLoading(false);
      navigate('/onboarding');
    }, 1500);
  };

  return (
    <div className="landing-container">
      {/* Navbar */}
      <nav className="navbar">
        <div className="nav-logo">
          <span style={{ fontSize: '1.5rem', fontWeight: 900, color: 'white' }}>Arihant</span>
          {/* <div className="powered-badge">Powered by YoLearn.ai</div> */}
        </div>
        <div className="nav-links">
          <span>Curriculum</span>
          <span>Features</span>
          <span>Success Stories</span>
          <button className="btn-secondary" onClick={() => setShowLogin(true)}>Log In</button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <div className="badge-wrapper">
            <div className="promo-badge">
              <Sparkles size={14} /> New: Adaptive AI Chapter Graphs
            </div>
          </div>
          <h1 className="hero-title">
            The Future of <span className="gradient-text">NEET & JEE</span> <br />
            Preparation is Here.
          </h1>
          <p className="hero-subtitle">
            Experience hyper-personalized learning with real-time AI tutoring, 
            interactive chapter graphs, and predictive performance analytics.
          </p>
          <div className="hero-actions">
            <button className="btn-primary" onClick={() => setShowLogin(true)}>
              Learn with AI <ChevronRight size={18} />
            </button>
            <button className="btn-outline">View Demo</button>
          </div>
          
          <div className="trust-badges">
            <div className="trust-item"><CheckCircle2 size={16} /> Trusted by 10k+ Students</div>
            <div className="trust-item"><CheckCircle2 size={16} /> 98% Success Rate</div>
          </div>
        </div>

        <div className="hero-visual">
          <div className="mockup-main">
            <img 
              src="https://images.unsplash.com/photo-1614850523296-d8c1af93d400?auto=format&fit=crop&q=80&w=1600" 
              alt="Background" 
              className="bg-img"
            />
            <div className="glass-card card-1 animate-float">
               <div className="card-header">
                 <Brain size={18} color="#F37920" />
                 <span>AI Concept Map</span>
               </div>
               <div className="card-viz">
                 <div className="node" />
                 <div className="node" />
                 <div className="node" />
                 <div className="line" />
                 <div className="line" />
               </div>
            </div>
            <div className="glass-card card-2 animate-float-delayed">
               <div className="card-header">
                 <Target size={18} color="#F37920" />
                 <span>Personalized Path</span>
               </div>
               <div className="card-bar"><div style={{ width: '70%', background: '#F37920' }} /></div>
               <div className="card-bar"><div style={{ width: '40%', background: '#ff9d52' }} /></div>
            </div>
          </div>
        </div>
      </section>

      {/* Mockups Section */}
      <section className="features">
        <h2 className="section-title">Designed for Competitive Excellence</h2>
        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-icon"><Target color="#ef4444" /></div>
            <h3>Structured Roadmaps</h3>
            <p>Follow a proven path tailored to your exam date and current preparation level.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><Brain color="#3b82f6" /></div>
            <h3>Adaptive AI Tutor</h3>
            <p>A personal tutor that understands your weak areas and explains concepts with analogies.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><Zap color="#fbbf24" /></div>
            <h3>Predictive Testing</h3>
            <p>Know your estimated NEET/JEE score before you even enter the exam hall.</p>
          </div>
        </div>
      </section>

      {/* Login Modal */}
      {showLogin && (
        <div className="modal-overlay" onClick={() => setShowLogin(false)}>
          <div className="login-modal animate-pop" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setShowLogin(false)}><X size={20} /></button>
            <div className="login-header">
              <div className="login-icon"><Lock size={32} /></div>
              <h2>Welcome Back</h2>
              <p>Sign in to continue your learning journey</p>
            </div>
            
            <form className="login-form" onSubmit={handleLogin}>
              <div className="input-group">
                <label>Email Address</label>
                <div className="input-wrapper">
                  <Mail size={18} className="input-icon" />
                  <input 
                    type="email" 
                    placeholder="Enter your email" 
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required 
                  />
                </div>
              </div>
              
              <div className="input-group">
                <label>Password</label>
                <div className="input-wrapper">
                  <Lock size={18} className="input-icon" />
                  <input 
                    type="password" 
                    placeholder="Enter your password" 
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required 
                  />
                </div>
              </div>
              
              <div className="form-options">
                <label className="checkbox-label">
                  <input type="checkbox" /> Remember me
                </label>
                <span className="forgot-pass">Forgot Password?</span>
              </div>
              
              <button type="submit" className="login-submit" disabled={isLoading}>
                {isLoading ? (
                  <div className="loader"></div>
                ) : (
                  <>Sign In <ArrowRight size={18} /></>
                )}
              </button>
            </form>
            
            <div className="login-footer">
              Don't have an account? <span className="signup-link">Create Account</span>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .landing-container {
          min-height: 100vh;
          background: #020617;
          color: white;
          font-family: 'Outfit', sans-serif;
          overflow-x: hidden;
        }

        .navbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 24px 64px;
          background: rgba(2, 6, 23, 0.7);
          backdrop-filter: blur(12px);
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 100;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .nav-logo {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .nav-links {
          display: flex;
          align-items: center;
          gap: 32px;
          font-size: 0.9rem;
          color: #94a3b8;
          font-weight: 500;
        }

        .nav-links span:hover { color: white; cursor: pointer; }

        .powered-badge {
          background: rgba(45, 212, 191, 0.1);
          color: #2dd4bf;
          font-size: 0.7rem;
          padding: 4px 10px;
          border-radius: 99px;
          border: 1px solid rgba(45, 212, 191, 0.2);
          font-weight: 700;
        }

        .hero {
          display: grid;
          grid-template-columns: 1fr 1fr;
          padding: 180px 64px 100px;
          gap: 64px;
          max-width: 1400px;
          margin: 0 auto;
        }

        .badge-wrapper { margin-bottom: 24px; }
        .promo-badge { 
          display: inline-flex; align-items: center; gap: 8px; 
          padding: 8px 16px; background: rgba(243, 121, 32, 0.1); 
          border: 1px solid rgba(243, 121, 32, 0.2); 
          border-radius: 99px; color: #F37920; 
          font-size: 0.85rem; font-weight: 700; 
        }

        .hero-title {
          font-size: 4rem;
          font-weight: 900;
          line-height: 1.1;
          margin-bottom: 24px;
          letter-spacing: -0.02em;
        }

        .gradient-text { 
          background: linear-gradient(to right, #F37920, #ff9d52); 
          -webkit-background-clip: text; 
          -webkit-text-fill-color: transparent; 
        }

        .hero-subtitle {
          font-size: 1.25rem;
          color: #94a3b8;
          line-height: 1.6;
          max-width: 600px;
          margin-bottom: 40px;
        }

        .hero-actions {
          display: flex;
          gap: 20px;
          margin-bottom: 48px;
        }

        .btn-primary {
          background: white;
          color: black;
          padding: 16px 32px;
          border-radius: 16px;
          font-weight: 800;
          font-size: 1rem;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 12px;
          transition: all 0.3s;
        }

        .btn-primary:hover { transform: translateY(-4px); box-shadow: 0 12px 24px rgba(255, 255, 255, 0.1); }

        .btn-secondary {
          background: rgba(255, 255, 255, 0.05);
          color: white;
          padding: 10px 24px;
          border-radius: 12px;
          font-weight: 600;
          border: 1px solid rgba(255, 255, 255, 0.1);
          cursor: pointer;
          transition: all 0.3s;
        }

        .btn-outline {
          background: transparent;
          color: white;
          padding: 16px 32px;
          border-radius: 16px;
          font-weight: 700;
          border: 1px solid rgba(255, 255, 255, 0.1);
          cursor: pointer;
          transition: all 0.3s;
        }

        .trust-badges {
          display: flex;
          gap: 24px;
        }

        .trust-item {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #475569;
          font-size: 0.85rem;
          font-weight: 600;
        }

        .hero-visual {
          position: relative;
        }

        .mockup-main {
          width: 100%;
          height: 500px;
          border-radius: 32px;
          background: #0f172a;
          border: 1px solid rgba(243, 121, 32, 0.1);
          overflow: hidden;
          position: relative;
          box-shadow: 0 40px 100px -20px rgba(0, 0, 0, 0.5);
        }

        .bg-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0.4;
        }

        .glass-card {
          position: absolute;
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          padding: 20px;
          width: 240px;
        }

        .card-1 { top: 60px; right: -30px; }
        .card-2 { bottom: 60px; left: -30px; }

        .card-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
          font-size: 0.85rem;
          font-weight: 700;
        }

        .card-viz {
          height: 80px;
          position: relative;
        }

        .node { width: 12px; height: 12px; border-radius: 50%; background: #F37920; position: absolute; }
        .node:nth-child(1) { top: 10px; left: 20px; }
        .node:nth-child(2) { top: 40px; left: 100px; background: #ff9d52; }
        .node:nth-child(3) { top: 10px; left: 180px; }
        .line { height: 1px; background: rgba(243, 121, 32, 0.1); position: absolute; }
        .line:nth-child(4) { width: 80px; top: 25px; left: 30px; transform: rotate(15deg); }

        .card-bar { height: 8px; width: 100%; background: rgba(255,255,255,0.05); border-radius: 4px; margin-bottom: 10px; overflow: hidden; }
        .card-bar div { height: 100%; border-radius: 4px; }

        .features { padding: 100px 64px; text-align: center; }
        .section-title { font-size: 2.5rem; font-weight: 800; margin-bottom: 64px; }

        .feature-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 32px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .feature-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          padding: 40px;
          border-radius: 24px;
          text-align: left;
          transition: all 0.3s;
        }

        .feature-card:hover { background: rgba(255, 255, 255, 0.04); border-color: rgba(243, 121, 32, 0.3); transform: translateY(-8px); }

        .feature-icon { width: 48px; height: 48px; background: rgba(243, 121, 32, 0.1); border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-bottom: 24px; color: #F37920; }

        .feature-card h3 { font-size: 1.25rem; margin-bottom: 16px; }
        .feature-card p { color: #a1a1aa; line-height: 1.6; }

        /* Modal Styles */
        .modal-overlay {
          position: fixed; inset: 0;
          background: rgba(2, 6, 23, 0.8);
          backdrop-filter: blur(20px);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000; padding: 20px;
        }

        .login-modal {
          background: #0f172a;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 32px;
          padding: 48px;
          width: 100%;
          max-width: 450px;
          position: relative;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }

        .close-btn { position: absolute; top: 24px; right: 24px; background: none; border: none; color: #475569; cursor: pointer; }

        .login-header { text-align: center; margin-bottom: 40px; }
        .login-icon { width: 64px; height: 64px; background: rgba(243, 121, 32, 0.1); border-radius: 20px; color: #F37920; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
        .login-header h2 { font-size: 1.75rem; font-weight: 800; margin: 0 0 8px 0; }
        .login-header p { color: #a1a1aa; }

        .login-form { display: flex; flex-direction: column; gap: 24px; }
        .input-group label { display: block; font-size: 0.85rem; font-weight: 700; color: #94a3b8; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
        .input-wrapper { position: relative; }
        .input-icon { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #475569; }
        .input-wrapper input {
          width: 100%;
          padding: 14px 14px 14px 48px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          color: white;
          font-size: 1rem;
          outline: none;
          transition: all 0.3s;
        }
        .input-wrapper input:focus { border-color: #F37920; background: rgba(255, 255, 255, 0.05); }

        .form-options { display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; color: #a1a1aa; }
        .checkbox-label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
        .forgot-pass:hover { color: #F37920; cursor: pointer; }

        .login-submit {
          background: #F37920;
          color: white;
          padding: 16px;
          border-radius: 12px;
          font-weight: 800;
          font-size: 1rem;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          transition: all 0.3s;
        }
        .login-submit:hover { transform: translateY(-2px); box-shadow: 0 8px 16px rgba(243, 121, 32, 0.3); }
        .login-submit:disabled { opacity: 0.5; cursor: not-allowed; }

        .login-footer { text-align: center; margin-top: 32px; font-size: 0.9rem; color: #a1a1aa; }
        .signup-link { color: white; font-weight: 700; cursor: pointer; }
        .signup-link:hover { color: #F37920; }

        .loader { width: 20px; height: 20px; border: 2px solid #000; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; }

        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pop { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
        @keyframes float { 
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-20px); }
        }
        .animate-float { animation: float 6s ease-in-out infinite; }
        .animate-float-delayed { animation: float 6s ease-in-out 3s infinite; }

        @media (max-width: 1024px) {
          .hero { grid-template-columns: 1fr; text-align: center; padding: 120px 24px 64px; }
          .hero-subtitle { margin: 0 auto 40px; }
          .hero-actions { justify-content: center; }
          .hero-visual { display: none; }
          .feature-grid { grid-template-columns: 1fr; }
          .navbar { padding: 16px 24px; }
          .nav-links { display: none; }
        }
      `}</style>
    </div>
  );
}
