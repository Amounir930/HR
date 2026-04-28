import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Polyfill for window.storage to use localStorage
if (typeof window !== 'undefined' && !(window as any).storage) {
  (window as any).storage = {
    get: async (key: string) => {
      const item = localStorage.getItem(key);
      return item ? { value: item } : null;
    },
    set: async (key: string, value: string) => {
      localStorage.setItem(key, value);
    }
  };
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)