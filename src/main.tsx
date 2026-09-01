import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/tokens.css';
import './ui/board.css';
import './ui/panel.css';
import './ui/dialog.css';
import { App } from './App.js';
import { ErrorBoundary } from './ui/ErrorBoundary.js';

const container = document.getElementById('root');
if (!container) throw new Error('Root container #root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
