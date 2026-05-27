import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const isUnavailableDesktopSendError = (value) =>
  /cannot read properties of undefined \(reading 'send'\)/i.test(String(value || ''));

const mountEmergencyFallback = (message = 'Something went wrong while loading the app.') => {
  const root = document.getElementById('root');
  if (!root) {
    return;
  }

  root.innerHTML = `
    <div class="app-runtime-fallback">
      <div class="app-runtime-fallback-card">
        <h1>DDO</h1>
        <p>${message}</p>
        <button type="button" class="app-runtime-fallback-button" onclick="window.location.reload()">
          Reload App
        </button>
      </div>
    </div>
  `;
};

window.addEventListener('error', (event) => {
  if (isUnavailableDesktopSendError(event.error?.message || event.message)) {
    event.preventDefault();
    return;
  }

  console.error('DDO boot error:', event.error || event.message);
  mountEmergencyFallback('The app hit a runtime error while opening.');
});

window.addEventListener('unhandledrejection', (event) => {
  if (isUnavailableDesktopSendError(event.reason?.message || event.reason)) {
    event.preventDefault();
    return;
  }

  console.error('DDO unhandled rejection:', event.reason);
  mountEmergencyFallback('The app could not finish loading due to a background error.');
});

try {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
} catch (error) {
  console.error('DDO render bootstrap failed:', error);
  mountEmergencyFallback('The app could not start properly.');
}
