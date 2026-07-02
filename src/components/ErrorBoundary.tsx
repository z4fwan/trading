'use client';
import React from 'react';

interface Props { children: React.ReactNode; fallback?: React.ReactNode; onRetry?: () => void; }
interface State { hasError: boolean; error: Error | null; resetKey: number; }

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, resetKey: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    console.error('[ErrorBoundary] Caught:', error.message, error.stack);
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Component stack:', info.componentStack);
  }

  handleRetry = () => {
    this.props.onRetry?.();
    this.setState(s => ({
      hasError: false,
      error: null,
      resetKey: s.resetKey + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="border border-red-800/50 bg-red-950/20 rounded-xl p-4 text-center space-y-2">
          <div className="text-red-400 text-sm font-bold font-mono">⚠️ Component Error</div>
          <div className="text-red-300/70 text-[10px] font-mono">{this.state.error?.message}</div>
          <button onClick={this.handleRetry}
            className="px-3 py-1 text-[9px] font-mono bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-all">
            Retry
          </button>
        </div>
      );
    }
    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
  }
}
