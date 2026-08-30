import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

interface LayoutProps {
  user: { username?: string; signInDetails?: { loginId?: string } } | undefined;
  onSignOut: (() => void) | undefined;
  children: ReactNode;
}

export default function Layout({ user, onSignOut, children }: LayoutProps) {
  const location = useLocation();
  const displayName = user?.signInDetails?.loginId ?? user?.username ?? 'User';

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="header-left">
          <Link to="/" className="logo">AWS Architecture Advisor</Link>
          <nav className="nav-links">
            <Link to="/" className={location.pathname === '/' ? 'active' : ''}>Dashboard</Link>
            <Link to="/templates" className={location.pathname === '/templates' ? 'active' : ''}>Templates</Link>
          </nav>
        </div>
        <div className="header-right">
          <span className="user-info">{displayName}</span>
          <button className="btn btn-secondary" onClick={onSignOut}>Sign Out</button>
        </div>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
