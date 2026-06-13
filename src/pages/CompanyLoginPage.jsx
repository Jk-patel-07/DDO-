import { useState } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import { buildApiUrl } from '../utils/api';
import { persistAuthSession } from '../utils/appAuth';

const CompanyLoginPage = () => {
  const [companyLoginForm, setCompanyLoginForm] = useState({
    companyId: '',
    companyKey: '',
    companyPassword: '',
  });
  const [companyLoginError, setCompanyLoginError] = useState('');
  const [companyLoginStatus, setCompanyLoginStatus] = useState('');
  const [isCompanyLoginSubmitting, setIsCompanyLoginSubmitting] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const handleCompanyLoginFieldChange = (field, value) => {
    setCompanyLoginForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleCompanyLoginSubmit = async (event) => {
    event.preventDefault();

    const companyId = companyLoginForm.companyId.trim();
    const companyKey = companyLoginForm.companyKey.trim();
    const companyPassword = companyLoginForm.companyPassword.trim();

    if (!companyId || !companyKey || !companyPassword) {
      setCompanyLoginError('Enter company login details.');
      return;
    }

    setIsCompanyLoginSubmitting(true);
    setCompanyLoginError('');
    setCompanyLoginStatus('');

    try {
      const response = await fetch(buildApiUrl('/api/company/login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          companyId,
          companyKey,
          companyPassword,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || payload.message || 'Company login failed.');
      }

      setCompanyLoginStatus(payload.message || 'Company login successful.');
      persistAuthSession(payload, true);

      // Notify the main process about successful login
      if (window.electronAPI?.companyLoginSuccess) {
        window.electronAPI.companyLoginSuccess(payload);
      } else {
        console.log('Company login success payload:', payload);
      }

      setCompanyLoginForm({
        companyId: '',
        companyKey: '',
        companyPassword: '',
      });
    } catch (error) {
      setCompanyLoginError(error.message || 'Company login server unavailable');
    } finally {
      setIsCompanyLoginSubmitting(false);
    }
  };

  return (
    <div className="user-register-modal" style={{ background: '#050c09', position: 'absolute', width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="user-register-card company-login-card popup-aurora-surface" style={{ margin: 'auto' }}>
        <div className="user-register-header">
          <div>
            <h2>Company Login</h2>
            <p>Secure access for company and admin users only.</p>
          </div>
          <div>
            <button
              type="button"
              className="user-login-window-button close"
              onClick={() => {
                if (window.close) window.close();
              }}
              aria-label="Close company login window"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <form className="user-register-form" onSubmit={handleCompanyLoginSubmit}>
          <label className="user-login-field">
            <span>Company ID</span>
            <input
              type="text"
              placeholder="Enter company ID"
              value={companyLoginForm.companyId}
              onChange={(event) => handleCompanyLoginFieldChange('companyId', event.target.value)}
              required
            />
          </label>

          <label className="user-login-field">
            <span>Company Key</span>
            <input
              type="text"
              placeholder="Enter company key"
              value={companyLoginForm.companyKey}
              onChange={(event) => handleCompanyLoginFieldChange('companyKey', event.target.value)}
              required
            />
          </label>

          <label className="user-login-field">
            <span>Company Password</span>
            <div className="user-password-input-wrap">
              <input
                type={passwordVisible ? 'text' : 'password'}
                placeholder="Enter company password"
                value={companyLoginForm.companyPassword}
                onChange={(event) => handleCompanyLoginFieldChange('companyPassword', event.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="user-password-toggle"
                onClick={() => setPasswordVisible(!passwordVisible)}
                aria-label={passwordVisible ? 'Hide password' : 'Show password'}
              >
                {passwordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          {companyLoginError ? <div className="spotify-auth-error">{companyLoginError}</div> : null}
          {companyLoginStatus ? <div className="user-register-success">{companyLoginStatus}</div> : null}

          <div className="user-register-actions">
            <button type="submit" className="user-login-submit" disabled={isCompanyLoginSubmitting}>
              {isCompanyLoginSubmitting ? 'Signing in...' : 'Login'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CompanyLoginPage;
