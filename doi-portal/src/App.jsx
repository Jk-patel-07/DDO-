import { useState, useEffect } from 'react';

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

function App() {
  const [routeInfo, setRouteInfo] = useState({ route: 'dashboard', updateId: null });

  // Simple Router
  useEffect(() => {
    const handleLocationChange = () => {
      const hash = window.location.hash;
      const path = window.location.pathname;

      let match = hash.match(/^#\/update-page\/([^/]+)/);
      if (match) {
        setRouteInfo({ route: 'update-page', updateId: match[1] });
        return;
      }

      match = path.match(/^\/update-page\/([^/]+)/);
      if (match) {
        setRouteInfo({ route: 'update-page', updateId: match[1] });
        return;
      }

      setRouteInfo({ route: 'dashboard', updateId: null });
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    handleLocationChange(); // run on init

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  if (routeInfo.route === 'update-page') {
    return <UpdatePage updateId={routeInfo.updateId} />;
  }

  return <PublisherDashboard />;
}

// ----------------------------------------------------
// 1. DEVELOPER/ADMIN PUBLISHER DASHBOARD COMPONENT
// ----------------------------------------------------
function PublisherDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken] = useState('');

  // Form states
  const [versionName, setVersionName] = useState('');
  const [size, setSize] = useState('');
  const [type, setType] = useState('UI + Security Update');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [description, setDescription] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');

  // Scanning states
  const [scannedChanges, setScannedChanges] = useState(null);
  const [scanning, setScanning] = useState(false);

  // Workflow states
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [stagedDraft, setStagedDraft] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Parse token on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('token');
    if (tokenParam) {
      sessionStorage.setItem('doi_auth_token', tokenParam);
      // Clean query parameter from URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const storedToken = sessionStorage.getItem('doi_auth_token') || '';
    setToken(storedToken);

    if (!storedToken) {
      setAuthChecking(false);
      return;
    }

    // Call auth check endpoint
    fetch(`${API_BASE_URL}/api/update/auth-check`, {
      headers: {
        'Authorization': `Bearer ${storedToken}`
      }
    })
      .then(res => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then(data => {
        setCurrentUser(data.user);
        setIsAuthenticated(true);
        setAuthChecking(false);
      })
      .catch(() => {
        setIsAuthenticated(false);
        setAuthChecking(false);
      });
  }, []);

  const addTag = (value, listSetter, inputSetter, existingList) => {
    const trimmed = value.trim();
    if (trimmed && !existingList.includes(trimmed)) {
      listSetter([...existingList, trimmed]);
      inputSetter('');
    }
  };

  const removeTag = (value, listSetter, existingList) => {
    listSetter(existingList.filter(item => item !== value));
  };

  const handleScanChanges = () => {
    setScanning(true);
    setScannedChanges(null);

    fetch(`${API_BASE_URL}/api/doi/changes`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(res => {
        if (!res.ok) {
          return res.json().then(data => { throw new Error(data.error || 'Failed to scan changes.'); });
        }
        return res.json();
      })
      .then(data => {
        setScannedChanges(data);
        setSize(data.packageSize);
        setScanning(false);
      })
      .catch(err => {
        alert('Scanning failed: ' + err.message);
        setScanning(false);
      });
  };

  // Submit and Publish Update
  const handleConfirmDraft = () => {
    setIsConfirmOpen(false);
    setConfirming(true);

    const payload = {
      versionName: versionName.trim(),
      type,
      description: description.trim(),
      downloadUrl: downloadUrl.trim() || undefined,
      releaseNotes: releaseNotes.trim() || undefined
    };

    fetch(`${API_BASE_URL}/api/update/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    })
      .then(res => res.json())
      .then(data => {
        setConfirming(false);
        if (data.error) {
          alert('Publishing failed: ' + data.error);
        } else {
          setStagedDraft(data);
        }
      })
      .catch(err => {
        setConfirming(false);
        alert('Network error publishing update: ' + err.message);
      });
  };

  // Submit and Publish Update
  const handlePublish = () => {
    if (!stagedDraft) return;

    setPublishing(true);
    fetch(`${API_BASE_URL}/api/update/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ updateId: stagedDraft.updateId })
    })
      .then(res => res.json())
      .then(data => {
        setPublishing(false);
        if (data.error) {
          alert('Publish failed: ' + data.error);
        } else {
          alert('Update published successfully! App users will be notified.');
          // reset form
          setVersionName('');
          setSize('');
          setDescription('');
          setScannedChanges(null);
          setStagedDraft(null);
        }
      })
      .catch(err => {
        setPublishing(false);
        alert('Network error publishing update: ' + err.message);
      });
  };

  if (authChecking) {
    return (
      <div style={styles.centerBox}>
        <div style={styles.spinner}></div>
        <h3 style={{ marginTop: '16px' }}>Verifying Developer Session...</h3>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <DoiLogin
        onLoginSuccess={(newToken, userObj) => {
          setToken(newToken);
          setCurrentUser(userObj);
          setIsAuthenticated(true);
        }}
      />
    );
  }

  return (
    <div style={styles.wrapper}>
      <div style={{ ...styles.glassCard, width: '100%', maxWidth: '800px', padding: '32px' }} class="animate-fade-in">
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>DOI One</h1>
            <p style={styles.subtitle}>Stage, sign, and publish updates to the DDO network</p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={styles.badge}>
              {currentUser?.email || 'Developer'}
            </div>
            <button
              onClick={() => {
                sessionStorage.removeItem('doi_auth_token');
                window.location.reload();
              }}
              style={{
                ...styles.btnLater,
                padding: '4px 12px',
                fontSize: '12px',
                borderRadius: '16px'
              }}
            >
              Logout
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={e => e.preventDefault()} style={styles.form}>
          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Version name</label>
              <input
                type="text"
                placeholder="e.g. DOI-1.1"
                value={versionName}
                onChange={e => setVersionName(e.target.value)}
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Update size</label>
              <input
                type="text"
                placeholder="Select installer package to calculate size..."
                value={size}
                readOnly
                style={{ ...styles.input, backgroundColor: 'rgba(255,255,255,0.03)', color: '#94a3b8' }}
              />
            </div>
          </div>

          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Update Type</label>
              <select
                value={type}
                onChange={e => setType(e.target.value)}
                style={styles.select}
              >
                <option value="UI + Security Update">UI + Security Update</option>
                <option value="Feature Update">Feature Update</option>
                <option value="Bug Fix Update">Bug Fix Update</option>
                <option value="Critical Security Update">Critical Security Update</option>
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Custom Download URL (Optional)</label>
              <input
                type="text"
                placeholder="Override package server URL..."
                value={downloadUrl}
                onChange={e => setDownloadUrl(e.target.value)}
                style={styles.input}
              />
            </div>
          </div>

          {/* Scan Changes Section */}
          <div style={styles.formGroup}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={styles.label}>Automatic File Changes Scan</label>
              <button
                type="button"
                onClick={handleScanChanges}
                disabled={scanning}
                style={{
                  ...styles.btnPrimary,
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  padding: '8px 16px',
                  fontSize: '13px',
                  maxWidth: '150px'
                }}
              >
                {scanning ? 'Scanning...' : 'Scan Changes'}
              </button>
            </div>

            {scannedChanges && (
              <div style={{
                background: 'rgba(3, 7, 18, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '16px',
                marginTop: '10px'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#60a5fa' }}>{scannedChanges.totalModified}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Modified files</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#34d399' }}>{scannedChanges.totalNew}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>New files</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#f87171' }}>{scannedChanges.totalDeleted}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Deleted files</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#fbbf24' }}>{scannedChanges.packageSize}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Package size</div>
                  </div>
                </div>

                {/* File list for review */}
                <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
                  <strong style={{ display: 'block', marginBottom: '6px' }}>Changed files and folders list for review:</strong>
                  <div style={{ maxHeight: '150px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '6px', fontFamily: 'monospace', fontSize: '11px', lineHeight: '1.5', textAlign: 'left' }}>
                    {scannedChanges.modified.map(f => (
                      <div key={f} style={{ color: '#60a5fa' }}>M {f}</div>
                    ))}
                    {scannedChanges.newFiles.map(f => (
                      <div key={f} style={{ color: '#34d399' }}>A {f}</div>
                    ))}
                    {scannedChanges.deleted.map(f => (
                      <div key={f} style={{ color: '#f87171' }}>D {f}</div>
                    ))}
                    {scannedChanges.renamed.map(r => (
                      <div key={r.to} style={{ color: '#fbbf24' }}>R {r.from} -&gt; {r.to}</div>
                    ))}
                    {scannedChanges.totalModified === 0 && scannedChanges.totalNew === 0 && scannedChanges.totalDeleted === 0 && scannedChanges.totalRenamed === 0 && (
                      <div style={{ color: '#94a3b8', textAlign: 'center' }}>No local file changes detected.</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Update Description */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Update Description</label>
            <textarea
              placeholder="Added new toolbar icon, improved animation, fixed popup bug and updated security validation."
              value={description}
              onChange={e => setDescription(e.target.value)}
              style={{ ...styles.input, height: '120px', resize: 'vertical' }}
              required
            />
          </div>

          {/* Release Notes */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Release notes (optional)</label>
            <textarea
              placeholder="Type optional release notes here..."
              value={releaseNotes}
              onChange={e => setReleaseNotes(e.target.value)}
              style={{ ...styles.input, height: '80px', resize: 'vertical' }}
            />
          </div>

          {/* Submit Actions */}
          <div style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
            <button
              type="button"
              onClick={() => {
                setVersionName('');
                setSize('');
                setDescription('');
                setScannedChanges(null);
                setReleaseNotes('');
                setStagedDraft(null);
              }}
              style={styles.btnSecondary}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (!versionName.trim()) return alert('Version name is required.');
                if (!scannedChanges) return alert('You must scan changes before submitting.');
                if (scannedChanges.totalModified === 0 && scannedChanges.totalNew === 0 && scannedChanges.totalRenamed === 0) {
                  return alert('No changed files detected to package. Make some local edits first.');
                }
                if (!description.trim()) return alert('Update description is required.');
                setIsConfirmOpen(true);
              }}
              disabled={confirming}
              style={styles.btnPrimary}
            >
              {confirming ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </form>

        {/* Results Draft Box */}
        {stagedDraft && (
          <div style={styles.resultBox}>
            <h3 style={{ color: '#10b981', margin: '0 0 12px 0', fontSize: '16px' }}>DDO Update Published Successfully!</h3>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={styles.label}>Secure Update Details Link (served by Port 6001)</label>
              <a href={stagedDraft.updatePageUrl} target="_blank" rel="noreferrer" style={styles.resultLink}>
                {stagedDraft.updatePageUrl}
              </a>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={styles.label}>Generated Package Checksum (SHA-256)</label>
              <div style={styles.resultText}>{stagedDraft.checksum}</div>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Dialog Overlay */}
      {isConfirmOpen && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.glassCard, width: '90%', maxWidth: '450px', padding: '24px' }}>
            <h3 style={{ marginTop: 0, color: '#818cf8', fontSize: '18px' }}>Confirm Update Creation</h3>
            <p style={{ color: '#cbd5e1', fontSize: '14px', lineHeight: '1.6' }}>
              Are you sure you want to create this DDO update?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <button onClick={() => setIsConfirmOpen(false)} style={styles.btnLater}>Cancel</button>
              <button onClick={handleConfirmDraft} style={styles.btnInstall}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// 2. CLIENT UPDATE VIEW COMPONENT (PORT 6001)
// ----------------------------------------------------
function UpdatePage({ updateId }) {
  const [update, setUpdate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('idle'); // idle, downloading, download-complete, installing, restart-required, cancelled, error
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    // Fetch details by updateId
    fetch(`${API_BASE_URL}/api/update/${updateId}`)
      .then(res => {
        if (!res.ok) throw new Error('Update details not found on port 5000.');
        return res.json();
      })
      .then(data => {
        setUpdate(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [updateId]);

  // Handle electron status updates
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.onUpdateStatus) {
      const unsubscribe = window.electronAPI.onUpdateStatus((statusObj) => {
        setStatus(statusObj.status);
        if (statusObj.percent !== undefined) {
          setDownloadPercent(statusObj.percent);
        }
        if (statusObj.message) {
          setErrorMessage(statusObj.message);
        }
      });
      return unsubscribe;
    }
  }, []);

  const handleInstallClick = () => {
    if (update?.downloadUrl && window.electronAPI?.startUpdateDownload) {
      window.electronAPI.startUpdateDownload(update.downloadUrl, update.checksum, update.signature);
    } else {
      alert('Internal installer downloads are only supported inside the DDO Electron app.');
    }
  };

  const handleLaterClick = () => {
    if (window.electronAPI?.closeUpdateWindow) {
      window.electronAPI.closeUpdateWindow();
    } else {
      window.close();
    }
  };

  if (loading) {
    return (
      <div style={styles.centerBox}>
        <div style={styles.spinner}></div>
        <h4 style={{ marginTop: '16px' }}>Loading update details...</h4>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.centerBox}>
        <div style={{ ...styles.glassCard, padding: '30px', textAlign: 'center' }}>
          <h3 style={{ color: '#ef4444' }}>Error</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...styles.wrapper, padding: '20px' }}>
      <div style={{ ...styles.glassCard, width: '100%', maxWidth: '600px', height: '100vh', maxHeight: '550px', display: 'flex', flexDirection: 'column', padding: '24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '12px', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', color: '#60a5fa', fontWeight: 'bold' }}>
            DDO Software Update
          </h2>
          <span style={{ fontSize: '11px', backgroundColor: 'rgba(96, 165, 250, 0.12)', border: '1px solid rgba(96, 165, 250, 0.3)', color: '#93c5fd', padding: '3px 8px', borderRadius: '12px', fontWeight: '600' }}>
            {update.type}
          </span>
        </div>

        {/* Info Box */}
        <div style={{ display: 'flex', gap: '24px', marginBottom: '16px', fontSize: '13px', backgroundColor: 'rgba(30, 41, 59, 0.3)', padding: '12px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
          <div><strong>New Version:</strong> <span style={{ color: '#60a5fa' }}>{update.versionName}</span></div>
          <div><strong>Update Size:</strong> <span style={{ color: '#94a3b8' }}>{update.size}</span></div>
          <div style={{ color: '#34d399', marginLeft: 'auto' }}>✓ Digital Signature Valid</div>
        </div>

        {/* Changelog area */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', paddingRight: '4px', marginBottom: '16px' }}>
          {update.releaseNotes && (
            <div>
              <h4 style={{ ...styles.clientSectionTitle, color: '#f59e0b' }}>Release Notes:</h4>
              <p style={{ margin: 0, fontSize: '12px', color: '#cbd5e1', whiteSpace: 'pre-line', lineHeight: '1.5', paddingLeft: '8px' }}>
                {update.releaseNotes}
              </p>
            </div>
          )}
          {update.changes && update.changes.length > 0 && (
            <div>
              <h4 style={styles.clientSectionTitle}>What changed in DDO:</h4>
              <ul style={styles.clientList}>
                {update.changes.map((item, idx) => <li key={idx}>{item}</li>)}
              </ul>
            </div>
          )}

          {update.securityChanges && update.securityChanges.length > 0 && (
            <div>
              <h4 style={{ ...styles.clientSectionTitle, color: '#fca5a5' }}>Security Updates:</h4>
              <ul style={styles.clientList}>
                {update.securityChanges.map((item, idx) => <li key={idx}>{item}</li>)}
              </ul>
            </div>
          )}

          {update.bugFixes && update.bugFixes.length > 0 && (
            <div>
              <h4 style={{ ...styles.clientSectionTitle, color: '#93c5fd' }}>Bug Fixes:</h4>
              <ul style={styles.clientList}>
                {update.bugFixes.map((item, idx) => <li key={idx}>{item}</li>)}
              </ul>
            </div>
          )}

          {update.graphicChanges && update.graphicChanges.length > 0 && (
            <div>
              <h4 style={styles.clientSectionTitle}>Graphic Changes:</h4>
              <ul style={styles.clientList}>
                {update.graphicChanges.map((item, idx) => <li key={idx}>{item}</li>)}
              </ul>
            </div>
          )}

          {update.animationChanges && update.animationChanges.length > 0 && (
            <div>
              <h4 style={styles.clientSectionTitle}>Animation Changes:</h4>
              <ul style={styles.clientList}>
                {update.animationChanges.map((item, idx) => <li key={idx}>{item}</li>)}
              </ul>
            </div>
          )}

          {update.changedFiles && update.changedFiles.length > 0 && (
            <div>
              <h4 style={styles.clientSectionTitle}>Changed Files & Folders:</h4>
              <ul style={styles.clientList}>
                {update.changedFiles.map((item, idx) => <li key={idx}>{item}</li>)}
              </ul>
            </div>
          )}

          {update.newFiles && update.newFiles.length > 0 && (
            <div>
              <h4 style={styles.clientSectionTitle}>New Files & Folders:</h4>
              <ul style={styles.clientList}>
                {update.newFiles.map((item, idx) => <li key={idx}>{item}</li>)}
              </ul>
            </div>
          )}
        </div>

        {/* Footer with Installation Status & Actions */}
        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          {/* Status bar */}
          {status === 'downloading' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContext: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
                <span>Downloading update internally...</span>
                <span>{downloadPercent}%</span>
              </div>
              <div style={{ width: '100%', height: '6px', backgroundColor: '#1e293b', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${downloadPercent}%`, height: '100%', backgroundColor: '#10b981', transition: 'width 0.1s' }} />
              </div>
            </div>
          )}

          {status === 'download-complete' && (
            <div style={{ fontSize: '12px', color: '#60a5fa', textAlign: 'center', fontWeight: '500' }}>
              Verification successful. Awaiting installation confirmation...
            </div>
          )}

          {status === 'installing' && (
            <div style={{ fontSize: '12px', color: '#93c5fd', textAlign: 'center', fontWeight: 'bold' }}>
              Installing update files... Please wait.
            </div>
          )}

          {status === 'restart-required' && (
            <div style={{ fontSize: '12px', color: '#34d399', textAlign: 'center', fontWeight: 'bold' }}>
              Update successful! Restarting DDO...
            </div>
          )}

          {status === 'cancelled' && (
            <div style={{ fontSize: '12px', color: '#f59e0b', textAlign: 'center' }}>
              Installation cancelled.
            </div>
          )}

          {status === 'error' && (
            <div style={{ fontSize: '12px', color: '#ef4444', textAlign: 'center', fontWeight: '500' }}>
              Error: {errorMessage || 'Failed to update.'}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button onClick={handleLaterClick} style={styles.btnLater}>Later</button>
            {(status === 'idle' || status === 'error' || status === 'cancelled') && (
              <button onClick={handleInstallClick} style={styles.btnInstall}>Install Update</button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

// ----------------------------------------------------
// UI STYLES
// ----------------------------------------------------
const styles = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '40px 20px',
    boxSizing: 'border-box'
  },
  centerBox: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '20px',
    backgroundColor: '#030712',
    color: '#f8fafc'
  },
  glassCard: {
    background: 'rgba(15, 23, 42, 0.65)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '16px',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.6)',
    boxSizing: 'border-box'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    paddingBottom: '20px',
    marginBottom: '24px'
  },
  title: {
    margin: 0,
    fontSize: '24px',
    fontWeight: '600',
    background: 'linear-gradient(90deg, #a5b4fc, #818cf8)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  },
  subtitle: {
    margin: '4px 0 0 0',
    fontSize: '13px',
    color: '#94a3b8'
  },
  badge: {
    fontSize: '12px',
    backgroundColor: 'rgba(129, 140, 248, 0.12)',
    border: '1px solid rgba(129, 140, 248, 0.3)',
    color: '#a5b4fc',
    padding: '4px 12px',
    borderRadius: '16px',
    fontWeight: '500'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px'
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '18px'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  label: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#94a3b8',
    letterSpacing: '0.3px'
  },
  input: {
    background: 'rgba(3, 7, 18, 0.6)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    color: '#f8fafc',
    borderRadius: '8px',
    padding: '10px 14px',
    fontSize: '14px',
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'all 0.2s'
  },
  select: {
    background: 'rgba(3, 7, 18, 0.6)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    color: '#f8fafc',
    borderRadius: '8px',
    padding: '10px 14px',
    fontSize: '14px',
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'all 0.2s',
    cursor: 'pointer'
  },
  uploadBox: {
    border: '2px dashed rgba(255, 255, 255, 0.1)',
    background: 'rgba(3, 7, 18, 0.4)',
    padding: '20px',
    borderRadius: '8px',
    textAlign: 'center',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'all 0.2s'
  },
  listInputRow: {
    display: 'flex',
    gap: '10px'
  },
  btnAdd: {
    background: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    color: '#f8fafc',
    borderRadius: '8px',
    cursor: 'pointer',
    padding: '0 16px',
    fontSize: '16px',
    fontWeight: '600',
    transition: 'all 0.2s'
  },
  tagsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '4px'
  },
  tag: {
    background: 'rgba(129, 140, 248, 0.1)',
    border: '1px solid rgba(129, 140, 248, 0.25)',
    color: '#a5b4fc',
    borderRadius: '6px',
    padding: '3px 8px',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  tagRemove: {
    background: 'none',
    border: 'none',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: '14px',
    padding: 0,
    fontWeight: 'bold',
    lineHeight: 1
  },
  btnPrimary: {
    background: 'linear-gradient(135deg, #818cf8 0%, #6366f1 100%)',
    color: 'white',
    border: 'none',
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: '600',
    borderRadius: '8px',
    cursor: 'pointer',
    flex: 1,
    transition: 'all 0.2s'
  },
  btnSecondary: {
    background: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#cbd5e1',
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: '600',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  resultBox: {
    marginTop: '28px',
    background: 'rgba(16, 185, 129, 0.06)',
    border: '1px solid rgba(16, 185, 129, 0.2)',
    borderRadius: '8px',
    padding: '20px'
  },
  resultLink: {
    background: 'rgba(0, 0, 0, 0.4)',
    padding: '8px 12px',
    borderRadius: '6px',
    fontFamily: 'monospace',
    fontSize: '13px',
    color: '#a7f3d0',
    display: 'block',
    wordBreak: 'break-all',
    marginBottom: '14px',
    textDecoration: 'none',
    border: '1px solid rgba(16, 185, 129, 0.15)'
  },
  resultText: {
    background: 'rgba(0, 0, 0, 0.4)',
    padding: '8px 12px',
    borderRadius: '6px',
    fontFamily: 'monospace',
    fontSize: '13px',
    color: '#cbd5e1',
    wordBreak: 'break-all',
    border: '1px solid rgba(255, 255, 255, 0.05)'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0, 0, 0, 0.8)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid rgba(255, 255, 255, 0.1)',
    borderTopColor: '#818cf8',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  // Client update elements
  clientSectionTitle: {
    margin: '0 0 6px 0',
    fontSize: '13px',
    color: '#f1f5f9',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    paddingBottom: '3px'
  },
  clientList: {
    margin: 0,
    paddingLeft: '20px',
    fontSize: '12px',
    color: '#94a3b8',
    lineHeight: '1.6'
  },
  btnLater: {
    background: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    color: '#cbd5e1',
    padding: '8px 20px',
    borderRadius: '6px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  btnInstall: {
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    color: 'white',
    border: 'none',
    padding: '8px 24px',
    borderRadius: '6px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  }
};

// ----------------------------------------------------
// 3. DEVELOPER/ADMIN LOGIN COMPONENT
// ----------------------------------------------------
function DoiLogin({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Password change state
  const [mustChange, setMustChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [tempToken, setTempToken] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Email and Password are required.');
      return;
    }

    setLoading(true);
    setError('');

    fetch(`${API_BASE_URL}/api/doi/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: email.trim(), password: password.trim() })
    })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to authenticate.');
        }
        return data;
      })
      .then(data => {
        const user = data.user;
        const isDev = user.role === 'admin' || user.role === 'developer';
        if (!isDev) {
          throw new Error('Access Denied. Only developers or admins are allowed.');
        }

        if (user.mustChangePassword) {
          setMustChange(true);
          setTempToken(data.token);
          setLoading(false);
          setError('First-time login: You must change your password to continue.');
        } else {
          sessionStorage.setItem('doi_auth_token', data.token);
          onLoginSuccess(data.token, user);
        }
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  };

  const handleChangePasswordSubmit = (e) => {
    e.preventDefault();
    if (!newPassword.trim() || !confirmPassword.trim()) {
      setError('Both password fields are required.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.trim().length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    setError('');

    fetch(`${API_BASE_URL}/api/doi/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tempToken}`
      },
      body: JSON.stringify({ newPassword: newPassword.trim() })
    })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to change password.');
        }
        return data;
      })
      .then(data => {
        sessionStorage.setItem('doi_auth_token', data.token);
        onLoginSuccess(data.token, data.user);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  };

  if (mustChange) {
    return (
      <div style={styles.centerBox}>
        <div style={{ ...styles.glassCard, width: '100%', maxWidth: '400px', padding: '32px' }}>
          <h2 style={{ ...styles.title, textAlign: 'center', marginBottom: '8px' }}>Change Password</h2>
          <p style={{ ...styles.subtitle, textAlign: 'center', marginBottom: '24px' }}>Please update your initial password to secure your account</p>

          {error && (
            <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', padding: '10px', borderRadius: '6px', fontSize: '13px', marginBottom: '16px', textAlign: 'center' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleChangePasswordSubmit} style={styles.form}>
            <div style={styles.formGroup}>
              <label style={styles.label}>New Password</label>
              <input
                type="password"
                placeholder="New Password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                style={styles.input}
                disabled={loading}
                required
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Confirm New Password</label>
              <input
                type="password"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                style={styles.input}
                disabled={loading}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ ...styles.btnPrimary, marginTop: '12px' }}
            >
              {loading ? 'Updating Password...' : 'Change Password & Login'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.centerBox}>
      <div style={{ ...styles.glassCard, width: '100%', maxWidth: '400px', padding: '32px' }}>
        <h2 style={{ ...styles.title, textAlign: 'center', marginBottom: '8px' }}>DOI One Login</h2>
        <p style={{ ...styles.subtitle, textAlign: 'center', marginBottom: '24px' }}>Please log in with your developer or admin credentials</p>

        {error && (
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', padding: '10px', borderRadius: '6px', fontSize: '13px', marginBottom: '16px', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Email Address</label>
            <input
              type="email"
              placeholder="developer@ddo.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={styles.input}
              disabled={loading}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={styles.input}
              disabled={loading}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ ...styles.btnPrimary, marginTop: '12px' }}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;
