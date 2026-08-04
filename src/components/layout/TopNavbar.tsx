import React from 'react';
import Image from 'next/image';
import { TerminalIcon, type IconName } from '@/components/icons/TerminalIcons';

export type NavView = 'overview' | 'chart' | 'stocks' | 'predictions' | 'momentum' | 'trust' | 'prices' | 'announcements' | 'intraday' | 'signals' | 'access' | 'brain';

export interface NavItem {
  id: NavView;
  icon: IconName;
  label: string;
}

interface TopNavbarProps {
  navItems: NavItem[];
  activeView: NavView;
  onSelectView: (view: NavView) => void;
  isAdmin: boolean;
  guestName: string;
  onLogout: () => void;
}

export default function TopNavbar({ navItems, activeView, onSelectView, isAdmin, guestName, onLogout }: TopNavbarProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  return (
    <>
      <nav className="hidden lg:flex flex-col w-64 h-full shrink-0 border-r" style={{ backgroundColor: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}>
        <div className="flex items-center gap-3 px-6 h-[72px] shrink-0 cursor-pointer border-b" style={{ borderColor: 'var(--panel-border)' }} onClick={() => onSelectView('overview')}>
          <div className="relative w-8 h-8">
            <Image src="/logo.png" alt="Logo" fill className="object-contain drop-shadow-[0_0_12px_rgba(6,182,212,0.6)]" />
          </div>
          <span className="font-bold text-slate-100 tracking-wider text-sm">Quantum Alpha</span>
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-4 flex flex-col gap-2 custom-scrollbar">
          {navItems.map(item => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectView(item.id)}
                className={`relative flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-[14px] transition-all duration-300 w-full text-left group overflow-hidden ${
                  isActive 
                    ? 'text-slate-100 shadow-md' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {/* Active bg effect */}
                <div className={`absolute inset-0 transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-10'}`} style={{ backgroundColor: isActive ? 'var(--accent-cyan)' : 'var(--accent-cyan)' }} />
                {isActive && <div className="absolute inset-0 bg-slate-900/90" />}

                <TerminalIcon 
                  name={item.icon} 
                  size={20} 
                  className={`relative z-10 transition-all duration-300 ${
                    isActive 
                      ? 'text-cyan-400' 
                      : 'text-slate-500 group-hover:text-cyan-300'
                  }`} 
                />
                <span className={`relative z-10 flex-1 truncate transition-transform duration-300 ${isActive ? 'font-semibold' : 'group-hover:translate-x-1'}`}>
                  {item.label}
                </span>
                
                {/* Active indicator bar */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-3/4 rounded-r-full" style={{ backgroundColor: 'var(--accent-cyan)', boxShadow: '0 0 10px var(--accent-cyan)' }} />
                )}
              </button>
            );
          })}
        </div>

        <div className="p-5 border-t shrink-0" style={{ borderColor: 'var(--panel-border)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs bg-slate-800 text-cyan-400 shadow-inner">
                {isAdmin ? 'AD' : guestName.charAt(0).toUpperCase() || 'G'}
              </div>
              <div className="flex flex-col">
                <span className="text-[13px] font-semibold text-slate-200 leading-tight truncate max-w-[100px]">{isAdmin ? 'Admin' : guestName}</span>
                <span className="text-[10px] text-slate-500 uppercase tracking-widest">{isAdmin ? 'Full Access' : 'Guest'}</span>
              </div>
            </div>
            <button 
              onClick={onLogout}
              className="p-2 text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
              title="Logout"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Top Nav */}
      <nav className="lg:hidden flex items-center justify-between h-16 px-5 border-b shrink-0" style={{ backgroundColor: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}>
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => onSelectView('overview')}>
          <div className="relative w-7 h-7">
            <Image src="/logo.png" alt="Logo" fill className="object-contain" />
          </div>
          <span className="font-bold text-slate-100 tracking-wider text-xs">Quantum Alpha</span>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 text-slate-400 hover:text-white"
        >
          <TerminalIcon name="dashboard" size={24} />
        </button>
      </nav>

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 top-16 z-40 lg:hidden overflow-y-auto" style={{ backgroundColor: 'var(--background)' }}>
          <div className="p-4 space-y-2">
            {navItems.map(item => {
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelectView(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-4 px-5 py-4 rounded-xl text-sm transition-all ${
                    isActive 
                      ? 'text-cyan-400 font-bold shadow-md' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  style={{ backgroundColor: isActive ? 'var(--panel-bg)' : 'transparent', border: isActive ? '1px solid var(--panel-border)' : '1px solid transparent' }}
                >
                  <TerminalIcon name={item.icon} size={20} className={isActive ? 'text-cyan-400' : 'text-slate-500'} />
                  <span>{item.label}</span>
                </button>
              );
            })}
            <button 
              onClick={onLogout}
              className="w-full flex items-center gap-4 px-5 py-4 rounded-xl text-sm text-red-400 hover:bg-red-500/10 mt-4"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
