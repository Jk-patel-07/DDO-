import { useEffect, useState } from 'react';
import { buildApiUrl } from '../utils/api';

export default function SpotifyCallbackPage() {
  const [status, setStatus] = useState('loading'); // 'loading', 'success', 'error'
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    const sendCallbackToBackend = async () => {
      try {
        const response = await fetch(buildApiUrl('/api/spotify/callback'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code, state, error }),
        });

        if (!response.ok) {
          throw new Error('Failed to communicate with DDO backend.');
        }

        if (error) {
          setStatus('error');
          setErrorMessage(error === 'access_denied' ? 'Access denied. You cancelled the sign-in request.' : error);
        } else {
          setStatus('success');
        }
      } catch (err) {
        setStatus('error');
        setErrorMessage(err.message || 'An unexpected error occurred during verification.');
      }
    };

    sendCallbackToBackend();
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logoContainer}>
          <div style={styles.ddoLogo}>DDO</div>
          <div style={styles.bridge}>✦</div>
          <svg style={styles.spotifyLogo} viewBox="0 0 24 24" fill="#1DB954" width="48" height="48">
            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.565.387-.86.207-2.377-1.454-5.37-1.783-8.892-.98-.336.075-.668-.135-.744-.47-.077-.337.135-.668.47-.745 3.856-.88 7.15-.5 9.82 1.134.296.18.388.564.206.858zm1.225-2.72c-.226.367-.707.487-1.074.26-2.72-1.672-6.87-2.157-10.08-1.182-.413.125-.847-.107-.972-.52-.125-.413.108-.847.52-.972 3.67-1.114 8.243-.574 11.347 1.33.367.227.487.708.26 1.075zm.107-2.847C14.502 8.766 8.87 8.58 5.617 9.567c-.506.154-1.04-.136-1.193-.642-.154-.507.137-1.04.643-1.194 3.744-1.137 9.948-.923 13.91 1.43.455.27.604.856.334 1.31-.27.455-.856.604-1.31.334z"/>
          </svg>
        </div>

        {status === 'loading' && (
          <div style={styles.content}>
            <div style={styles.spinner} />
            <h2 style={styles.heading}>Connecting with DDO</h2>
            <p style={styles.text}>Exchanging secure credentials with Spotify. Please do not close this window.</p>
          </div>
        )}

        {status === 'success' && (
          <div style={styles.content}>
            <div style={styles.successIcon}>✓</div>
            <h2 style={styles.heading}>Successfully Connected!</h2>
            <p style={styles.text}>Your Spotify account is now linked to the DDO toolbar.</p>
            <p style={styles.subtext}>You can safely close this browser window and return to DDO.</p>
            <button style={styles.button} onClick={() => window.close()}>
              Close Tab
            </button>
          </div>
        )}

        {status === 'error' && (
          <div style={styles.content}>
            <div style={styles.errorIcon}>✕</div>
            <h2 style={styles.heading}>Connection Failed</h2>
            <p style={styles.text}>{errorMessage || 'Spotify sign-in was cancelled or failed.'}</p>
            <p style={styles.subtext}>Please close this window and try connecting again from the DDO toolbar.</p>
            <button style={styles.button} onClick={() => window.close()}>
              Close Tab
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: 'radial-gradient(circle at center, #18181b 0%, #09090b 100%)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    color: '#f4f4f5',
    margin: 0,
    padding: '20px',
  },
  card: {
    width: '100%',
    maxWidth: '460px',
    background: 'rgba(24, 24, 27, 0.75)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(63, 63, 70, 0.4)',
    borderRadius: '16px',
    padding: '40px 30px',
    textAlign: 'center',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
  },
  logoContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    marginBottom: '32px',
  },
  ddoLogo: {
    fontSize: '24px',
    fontWeight: '800',
    letterSpacing: '1px',
    color: '#ffffff',
    background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
    padding: '6px 12px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(168, 85, 247, 0.3)',
  },
  bridge: {
    fontSize: '20px',
    color: '#71717a',
  },
  spotifyLogo: {
    filter: 'drop-shadow(0 4px 12px rgba(29, 185, 84, 0.3))',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  heading: {
    fontSize: '22px',
    fontWeight: '700',
    marginBottom: '12px',
    color: '#ffffff',
  },
  text: {
    fontSize: '15px',
    color: '#d4d4d8',
    lineHeight: '1.6',
    margin: '0 0 8px 0',
  },
  subtext: {
    fontSize: '13px',
    color: '#a1a1aa',
    lineHeight: '1.5',
    margin: '0 0 24px 0',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid rgba(255, 255, 255, 0.1)',
    borderTop: '3px solid #1db954',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '24px',
  },
  successIcon: {
    width: '60px',
    height: '60px',
    background: 'rgba(16, 185, 129, 0.15)',
    border: '2px solid #10b981',
    borderRadius: '50%',
    color: '#10b981',
    fontSize: '28px',
    lineHeight: '56px',
    textAlign: 'center',
    marginBottom: '24px',
    boxShadow: '0 0 20px rgba(16, 185, 129, 0.2)',
  },
  errorIcon: {
    width: '60px',
    height: '60px',
    background: 'rgba(239, 68, 68, 0.15)',
    border: '2px solid #ef4444',
    borderRadius: '50%',
    color: '#ef4444',
    fontSize: '28px',
    lineHeight: '56px',
    textAlign: 'center',
    marginBottom: '24px',
    boxShadow: '0 0 20px rgba(239, 68, 68, 0.2)',
  },
  button: {
    background: '#27272a',
    border: '1px solid #3f3f46',
    color: '#ffffff',
    padding: '10px 24px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    outline: 'none',
  },
};

// Add raw CSS for spinner animation if needed by checking document
if (typeof document !== 'undefined') {
  const styleId = 'spotify-callback-spinner-style';
  if (!document.getElementById(styleId)) {
    const styleEl = document.createElement('style');
    styleEl.id = styleId;
    styleEl.innerHTML = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(styleEl);
  }
}
