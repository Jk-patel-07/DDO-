import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const isUnavailableDesktopSendError = (value) =>
  /cannot read properties of undefined \(reading 'send'\)/i.test(String(value || ''));

window.addEventListener('error', (event) => {
  if (isUnavailableDesktopSendError(event.error?.message || event.message)) {
    event.preventDefault();
  }
});

window.addEventListener('unhandledrejection', (event) => {
  if (isUnavailableDesktopSendError(event.reason?.message || event.reason)) {
    event.preventDefault();
  }
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
