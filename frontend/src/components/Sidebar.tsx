import { NavLink } from 'react-router-dom';
import { LayoutDashboard, BookOpen, BrainCircuit, Map as MapIcon, BarChart2 } from 'lucide-react';

export default function Sidebar() {
  const activeStyle = {
    color: 'var(--accent-primary)',
    background: 'var(--glass-bg)',
    borderColor: 'var(--glass-border)',
    boxShadow: 'var(--glass-shadow)'
  };

  const navItemStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-secondary)',
    transition: 'all var(--transition-fast)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'transparent',
    textDecoration: 'none'
  };

  return (
    <aside style={{
      width: 'var(--sidebar-width)',
      height: '100vh',
      borderRight: '1px solid var(--border-color)',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(10, 12, 16, 0.4)',
      backdropFilter: 'blur(20px)',
      position: 'sticky',
      top: 0
    }}>
      <div style={{ marginBottom: '40px', padding: '0 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="https://yolearn-assets.s3.us-west-2.amazonaws.com/yo.png" alt="Logo" style={{ width: 32, height: 32, borderRadius: 8 }} />
          <div>
            <span style={{ fontSize: '1.5rem', fontWeight: 900, color: 'white', display: 'block', lineHeight: 1.1 }}>Arihant</span>
            <div className="powered-badge" style={{ fontSize: '0.6rem', marginTop: 4 }}>Powered by YoLearn.ai</div>
          </div>
        </div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <NavLink 
          to="/dashboard" 
          style={({isActive}) => isActive ? { ...navItemStyle, ...activeStyle } : navItemStyle}
        >
          <LayoutDashboard size={20} />
          <span>Dashboard</span>
        </NavLink>

        <NavLink 
          to="/learning" 
          style={({isActive}) => isActive ? { ...navItemStyle, ...activeStyle } : navItemStyle}
        >
          <BookOpen size={20} />
          <span>Learning Agent</span>
        </NavLink>

        <NavLink 
          to="/practice" 
          style={({isActive}) => isActive ? { ...navItemStyle, ...activeStyle } : navItemStyle}
        >
          <BrainCircuit size={20} />
          <span>Practice Lab</span>
        </NavLink>

        <NavLink 
          to="/test"
          style={({isActive}) => isActive ? { ...navItemStyle, ...activeStyle } : navItemStyle}
        >
          <BarChart2 size={20} />
          <span>Test Center</span>
        </NavLink>

        <NavLink 
          to="/journey/list"
          style={({isActive}) => isActive ? { ...navItemStyle, ...activeStyle } : navItemStyle}
        >
          <MapIcon size={20} />
          <span>My Journeys</span>
        </NavLink>
      </nav>
      
      <div style={{ marginTop: 'auto', padding: '16px', borderRadius: 'var(--border-radius-md)', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Active User : Srijan</p>
        <div style={{ height: '4px', background: 'var(--border-color)', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ width: '65%', height: '100%', background: 'var(--accent-primary)' }}></div>
        </div>
      </div>
    </aside>
  );
}
