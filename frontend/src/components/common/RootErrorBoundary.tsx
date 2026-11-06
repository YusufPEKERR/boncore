import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class RootErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('Critical Root Error caught by RootErrorBoundary:', error, errorInfo);
  }

  public handleReload = () => {
    window.location.reload();
  };

  public handleReturnHome = () => {
    try {
      window.location.hash = '#tables';
    } catch {}
    window.location.reload();
  };

  public handleClearCacheAndReload = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    window.location.href = '/';
  };

  public toggleDetails = () => {
    this.setState(prev => ({ showDetails: !prev.showDetails }));
  };

  public render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error?.message || 'Beklenmedik bir sistem hatası meydana geldi.';
      const componentStack = this.state.errorInfo?.componentStack || '';

      return (
        <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-950 text-slate-100 select-none font-sans">
          <div className="max-w-lg w-full bg-slate-900 border border-rose-900/60 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-center animate-fadeIn">
            {/* Header Icon & Brand */}
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-3xl bg-rose-950/80 border border-rose-700/50 text-rose-400 flex items-center justify-center shadow-lg shadow-rose-950/50">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div className="inline-block px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-[10px] font-black tracking-wider uppercase">
                BonCore POS & Restoran Sistemi
              </div>
            </div>

            {/* Error Message */}
            <div className="space-y-2">
              <h1 className="text-xl sm:text-2xl font-black text-white">
                Bir Sorun Oluştu
              </h1>
              <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
                Arayüz render edilirken beklenmedik bir hata ile karşılaşıldı. Verileriniz güvendedir. Sayfayı yenileyerek çalışmaya devam edebilirsiniz.
              </p>
            </div>

            {/* Technical Detail Accordion */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl overflow-hidden text-left">
              <button
                type="button"
                onClick={this.toggleDetails}
                className="w-full px-4 py-3 flex items-center justify-between text-xs font-bold text-slate-400 hover:text-slate-200 transition"
              >
                <span>Hata Ayrıntısı: {errorMessage.slice(0, 45)}{errorMessage.length > 45 ? '...' : ''}</span>
                {this.state.showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {this.state.showDetails && (
                <div className="px-4 pb-3 pt-1 border-t border-slate-800 text-[11px] font-mono text-rose-300/90 max-h-48 overflow-y-auto space-y-2">
                  <div className="font-bold text-rose-400">{errorMessage}</div>
                  {componentStack && (
                    <pre className="whitespace-pre-wrap text-[10px] text-slate-500">
                      {componentStack}
                    </pre>
                  )}
                </div>
              )}
            </div>

            {/* Recovery Action Buttons */}
            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm shadow-lg shadow-emerald-950/50 transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Sayfayı Yenile</span>
              </button>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={this.handleReturnHome}
                  className="py-3 px-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Home className="w-3.5 h-3.5" />
                  <span>Ana Ekrana Dön</span>
                </button>

                <button
                  type="button"
                  onClick={this.handleClearCacheAndReload}
                  className="py-3 px-3 rounded-2xl bg-slate-800 hover:bg-rose-950/50 hover:text-rose-200 text-slate-300 font-bold text-xs border border-transparent hover:border-rose-900/60 transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Önbelleği Temizle</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
