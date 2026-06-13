import { useState, useEffect } from 'react';

const DdoUpdatePage = () => {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [status, setStatus] = useState('idle'); // idle, downloading, download-complete, installing, restart-required, cancelled, error
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.onUpdateData) {
      const unsubscribe = window.electronAPI.onUpdateData((data) => {
        console.log('Received update info on frontend:', data);
        setUpdateInfo(data);
      });
      return unsubscribe;
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.onUpdateStatus) {
      const unsubscribe = window.electronAPI.onUpdateStatus((statusObj) => {
        console.log('Received status update on frontend:', statusObj);
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
    if (updateInfo?.downloadUrl && window.electronAPI?.startUpdateDownload) {
      window.electronAPI.startUpdateDownload(updateInfo.downloadUrl);
    }
  };

  if (!updateInfo) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: '#0d1117',
        color: '#8b949e',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '14px'
      }}>
        Loading update details...
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      backgroundColor: '#0d1117',
      color: '#c9d1d9',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      boxSizing: 'border-box',
      padding: '24px',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #21262d', paddingBottom: '12px', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', color: '#58a6ff', fontWeight: 'bold' }}>
          DDO Software Update
        </h2>
        <span style={{
          fontSize: '11px',
          backgroundColor: '#1f6feb',
          color: 'white',
          padding: '3px 8px',
          borderRadius: '12px',
          fontWeight: '600'
        }}>
          {updateInfo.type}
        </span>
      </div>

      {/* Info Rows */}
      <div style={{ display: 'flex', gap: '24px', marginBottom: '16px', fontSize: '13px', backgroundColor: '#161b22', padding: '12px', borderRadius: '6px', border: '1px solid #30363d' }}>
        <div><strong>New Version:</strong> <span style={{ color: '#58a6ff' }}>{updateInfo.latestVersion}</span></div>
        <div><strong>Update Size:</strong> <span style={{ color: '#8b949e' }}>{updateInfo.size}</span></div>
      </div>

      {/* Changelog Sections */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        backgroundColor: '#0d1117',
        borderRadius: '6px',
        border: '1px solid #21262d',
        padding: '12px 16px',
        marginBottom: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px'
      }}>
        {updateInfo.changes && updateInfo.changes.length > 0 && (
          <div>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '13px', color: '#f0f6fc', borderBottom: '1px solid #30363d', paddingBottom: '2px' }}>What changed:</h4>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: '#8b949e', lineHeight: '1.6' }}>
              {updateInfo.changes.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {updateInfo.securityChanges && updateInfo.securityChanges.length > 0 && (
          <div>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '13px', color: '#ff7b72', borderBottom: '1px solid #30363d', paddingBottom: '2px' }}>Security updates:</h4>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: '#8b949e', lineHeight: '1.6' }}>
              {updateInfo.securityChanges.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {updateInfo.bugFixes && updateInfo.bugFixes.length > 0 && (
          <div>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '13px', color: '#79c0ff', borderBottom: '1px solid #30363d', paddingBottom: '2px' }}>Bug fixes:</h4>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: '#8b949e', lineHeight: '1.6' }}>
              {updateInfo.bugFixes.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Progress & Actions Footer */}
      <div style={{ borderTop: '1px solid #21262d', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        
        {/* Status display */}
        {status === 'downloading' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#8b949e' }}>
              <span>Downloading update file...</span>
              <span>{downloadPercent}%</span>
            </div>
            <div style={{ width: '100%', height: '6px', backgroundColor: '#21262d', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${downloadPercent}%`, height: '100%', backgroundColor: '#238636', transition: 'width 0.1s' }} />
            </div>
          </div>
        )}

        {status === 'download-complete' && (
          <div style={{ fontSize: '12px', color: '#79c0ff', textAlign: 'center', fontWeight: '500' }}>
            Download complete. Awaiting user confirmation to install...
          </div>
        )}

        {status === 'installing' && (
          <div style={{ fontSize: '12px', color: '#58a6ff', textAlign: 'center', fontWeight: 'bold' }}>
            Installing update... Please wait.
          </div>
        )}

        {status === 'restart-required' && (
          <div style={{ fontSize: '12px', color: '#56ff56', textAlign: 'center', fontWeight: 'bold' }}>
            Restarting DDO to complete the installation...
          </div>
        )}

        {status === 'cancelled' && (
          <div style={{ fontSize: '12px', color: '#ffa657', textAlign: 'center' }}>
            Installation cancelled by user.
          </div>
        )}

        {status === 'error' && (
          <div style={{ fontSize: '12px', color: '#f85149', textAlign: 'center', fontWeight: '500' }}>
            Error: {errorMessage || 'Failed to update.'}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          {(status === 'idle' || status === 'error' || status === 'cancelled') && (
            <button
              onClick={handleInstallClick}
              style={{
                backgroundColor: '#238636',
                border: '1px solid rgba(240, 246, 252, 0.1)',
                color: 'white',
                padding: '8px 20px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 'bold',
                transition: 'background-color 0.2s',
              }}
            >
              Install Update
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DdoUpdatePage;
