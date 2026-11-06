import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ThemeProvider } from './context/ThemeContext';
import { RootErrorBoundary } from './components/common/RootErrorBoundary';
import './index.css';

// Global Unhandled Promise Rejection Guard
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.warn('Unhandled Promise Rejection caught at window:', event.reason);
    const reasonMsg = event.reason?.message || (typeof event.reason === 'string' ? event.reason : 'Ağ veya işlem hatası');
    window.dispatchEvent(new CustomEvent('boncore_toast', {
      detail: { message: `Sistem Uyarısı: ${reasonMsg}`, type: 'warning' }
    }));
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </RootErrorBoundary>
  </React.StrictMode>,
);
