import { Component, ReactNode, StrictMode } from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('App crashed:', error.message);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-space-gray-900 text-white text-center">
          <div className="glass-panel p-10 rounded-[40px] max-w-md">
            <h2 className="text-2xl font-bold mb-4">Ops! Algo deu errado</h2>
            <p className="text-white/60 mb-8">Ocorreu um erro inesperado. Por favor, recarregue a página.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-8 py-3 bg-white text-black font-bold rounded-full uppercase tracking-widest text-xs"
            >
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
);
