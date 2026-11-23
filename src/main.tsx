import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryState {
  error: Error | null;
}

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { error: null };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  public render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen table-felt-surface flex items-center justify-center p-6">
          <div className="bg-[#FBF9F4] rounded-xl border border-rose-300 max-w-md w-full p-6 shadow-xl space-y-3 text-center">
            <h1 className="text-lg font-bold text-slate-900">حدث خطأ أثناء تشغيل اللعبة</h1>
            <p className="text-xs text-slate-600 font-mono break-words">{this.state.error.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-[#0F5132] hover:bg-[#0B3F27] text-white text-xs font-semibold"
            >
              إعادة التحميل
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  );
}
