import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './base.css';
import App from './App';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register the worker pipeline lazily so the store never statically imports workers.
void import('./core/pipelineRunner').then((m) => m.installPipelineRunner());
