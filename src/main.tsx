import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const API_BASE_URL = 'https://velvitpaw-1.onrender.com';

if (import.meta.env.PROD && typeof window !== 'undefined') {
  const originalFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      return originalFetch(`${API_BASE_URL}${input}`, init);
    }
    if (input instanceof URL && input.pathname.startsWith('/api/') && input.host === window.location.host) {
      return originalFetch(`${API_BASE_URL}${input.pathname}${input.search}`, init);
    }
    if (input instanceof Request && input.url.startsWith(`${window.location.origin}/api/`)) {
      const newUrl = input.url.replace(window.location.origin, API_BASE_URL);
      return originalFetch(new Request(newUrl, input), init);
    }
    return originalFetch(input as RequestInfo, init);
  }) as typeof window.fetch;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
