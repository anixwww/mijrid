import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message || 'Невідома помилка інтерфейсу',
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled React render error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetUiCache = () => {
    try {
      localStorage.removeItem('rodovid_clipboard_buffer');
      localStorage.removeItem('rodovid_tab_order');
      localStorage.removeItem('rodovid_show_all_branch_arrows');
    } catch {
      /* ignore storage errors */
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center p-6 bg-[#f8faf8] dark:bg-[#111315] text-stone-800 dark:text-zinc-100">
          <div className="max-w-md w-full rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-[#1c1f24] shadow-xl p-6 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-center">
              <img
                src="/assets/logo-tree-transparent.png"
                alt="Родовід"
                className="w-10 h-10 object-contain"
              />
            </div>
            <h1 className="text-lg font-bold text-stone-900 dark:text-zinc-100 mb-2">
              Виникла помилка відображення
            </h1>
            <p className="text-sm text-stone-600 dark:text-zinc-400 mb-5">
              Ваші збережені дані дерева в безпеці. Спробуйте оновити сторінку.
            </p>
            {this.state.errorMessage && (
              <details className="mb-5 text-left rounded-lg bg-stone-50 dark:bg-zinc-900/70 border border-stone-200 dark:border-zinc-800 px-3 py-2 text-xs text-stone-500 dark:text-zinc-400">
                <summary className="cursor-pointer font-medium select-none">Технічні деталі</summary>
                <p className="mt-1.5 font-mono break-words">{this.state.errorMessage}</p>
              </details>
            )}
            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                Перезавантажити
              </button>
              <button
                type="button"
                onClick={this.handleResetUiCache}
                className="flex-1 px-4 py-2.5 rounded-xl border border-stone-200 dark:border-zinc-700 hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-700 dark:text-zinc-200 text-sm font-medium transition-colors cursor-pointer"
              >
                Скинути кеш UI
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
