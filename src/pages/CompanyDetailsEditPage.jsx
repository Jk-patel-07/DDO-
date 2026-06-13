import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BadgeCheck, LoaderCircle, Upload, ShieldCheck, FileText } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import { buildApiUrl } from '../utils/api';
import { clearStoredAuthSession, createAuthHeaders, readStoredAuthSession } from '../utils/appAuth';

const COMPANY_EDIT_ACCESS_TOKEN_KEY = 'ddo_company_edit_access_token';
const COMPANY_DASHBOARD_RETURN_KEY = 'ddo_open_company_dashboard';

const emptyForm = {
  companyName: '',
  companyWebsite: '',
  companyDetails: '',
  companyEmail: '',
  companyPhone: '',
  companyAddress: '',
  city: '',
  state: '',
  country: '',
  pincode: '',
  fillerName: '',
  fillerEmail: '',
  fillerPhone: '',
  companyPosition: '',
  companyLogo: null,
  companyPhoto: null,
  companyRegisteredProof: null,
};

const sectionFields = [
  {
    title: 'Company Overview',
    description: 'Update the core company profile shown across DDO One and CFM.',
    fields: [
      ['companyName', 'Company name', 'text'],
      ['companyWebsite', 'Company website URL', 'url'],
      ['companyDetails', 'Company details', 'textarea'],
    ],
  },
  {
    title: 'Contact Details',
    description: 'Keep the registered contact information accurate for approval and follow-up.',
    fields: [
      ['companyEmail', 'Company email', 'email'],
      ['companyPhone', 'Company phone number', 'tel'],
      ['companyAddress', 'Head office address', 'textarea'],
      ['city', 'City', 'text'],
      ['state', 'State', 'text'],
      ['country', 'Country', 'text'],
      ['pincode', 'Pincode', 'text'],
    ],
  },
  {
    title: 'Filler Information',
    description: 'These details identify who prepared the edit request.',
    fields: [
      ['fillerName', 'Person or filler name', 'text'],
      ['fillerEmail', 'Person or filler email', 'email'],
      ['fillerPhone', 'Person or filler phone', 'tel'],
      ['companyPosition', 'Company position', 'text'],
    ],
  },
];

async function requestBackendJson(
  endpoint,
  options = {},
  { requiresAuth = false, requiresEditAccess = false } = {},
) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (requiresAuth) {
    Object.assign(headers, createAuthHeaders(headers));
  }

  if (requiresEditAccess) {
    const editAccessToken = window.sessionStorage.getItem(COMPANY_EDIT_ACCESS_TOKEN_KEY) || '';
    if (editAccessToken) {
      headers['x-company-edit-token'] = editAccessToken;
    }
  }

  const response = await fetch(buildApiUrl(endpoint), {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || 'Request failed.');
  }

  return payload;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name,
      mimeType: file.type,
      size: file.size,
      dataUrl: typeof reader.result === 'string' ? reader.result : '',
    });
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function AssetPreview({ asset, label }) {
  if (!asset?.name) {
    return (
      <div className="company-edit-asset-placeholder">
        <Upload size={16} />
        <span>No {label.toLowerCase()} uploaded yet.</span>
      </div>
    );
  }

  const isImage = /^image\//i.test(asset.mimeType || '');

  return (
    <div className="company-edit-asset-card">
      <div>
        <strong>{asset.name}</strong>
        <span>{asset.mimeType || 'Uploaded file'}</span>
      </div>
      {isImage && asset.dataUrl ? (
        <img src={asset.dataUrl} alt={asset.name} className="company-edit-asset-image" />
      ) : (
        <div className="company-edit-asset-icon">
          <FileText size={18} />
        </div>
      )}
    </div>
  );
}

function CompanyDetailsEditPage() {
  const [form, setForm] = useState(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const authSession = useMemo(() => readStoredAuthSession(), []);
  const hasCompanySession = authSession?.user?.role === 'company';

  useEffect(() => {
    document.title = 'DDO One - Company Details Edit';
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.resizeWindow) {
      window.electronAPI.resizeWindow({
        width: window.innerWidth,
        height: 650
      });
    }
    if (typeof window !== 'undefined' && window.electronAPI?.setIgnoreMouseEvents) {
      window.electronAPI.setIgnoreMouseEvents(false);
    }
  }, []);

  useEffect(() => {
    if (!hasCompanySession) {
      setError('Company login is required before opening the DDO One edit page.');
      setIsLoading(false);
      return;
    }

    const editAccessToken = window.sessionStorage.getItem(COMPANY_EDIT_ACCESS_TOKEN_KEY);
    if (!editAccessToken) {
      setError('Verify your company password from CFM Settings before opening edit mode.');
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const loadCurrentDetails = async () => {
      try {
        setIsLoading(true);
        setError('');
        const payload = await requestBackendJson('/api/cfm/company/edit/current', { method: 'GET' }, {
          requiresAuth: true,
          requiresEditAccess: true,
        });

        if (!cancelled) {
          setForm({
            ...emptyForm,
            ...(payload.company || {}),
          });
        }
      } catch (requestError) {
        if (!cancelled) {
          if (/authentication|required|expired/i.test(String(requestError.message || ''))) {
            clearStoredAuthSession('company');
          }
          setError(requestError.message || 'Unable to load current company details.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadCurrentDetails();

    return () => {
      cancelled = true;
    };
  }, [hasCompanySession]);

  const handleFieldChange = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleFileChange = async (field, file) => {
    if (!file) {
      return;
    }

    try {
      const asset = await readFileAsDataUrl(file);
      handleFieldChange(field, asset);
    } catch (fileError) {
      setError(fileError.message || 'Unable to read the selected file.');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');
    setStatus('');

    try {
      const payload = await requestBackendJson('/api/cfm/company/edit/request', {
        method: 'POST',
        body: JSON.stringify(form),
      }, {
        requiresAuth: true,
        requiresEditAccess: true,
      });

      window.sessionStorage.removeItem(COMPANY_EDIT_ACCESS_TOKEN_KEY);
      setStatus(payload.message || 'Edit request submitted for approval.');
    } catch (requestError) {
      setError(requestError.message || 'Unable to submit the edit request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToCfm = () => {
    window.sessionStorage.setItem(COMPANY_DASHBOARD_RETURN_KEY, '1');
    window.location.assign('/');
  };

  return (
    <main className="company-edit-page">
      <section className="company-edit-shell">
        <header className="company-edit-hero">
          <div className="company-edit-hero-top">
            <button type="button" className="company-edit-back" onClick={handleBackToCfm}>
              <ArrowLeft size={16} />
              <span>Back to CFM</span>
            </button>
            <div className="company-edit-badge">
              <BadgeCheck size={15} />
              <span>Edit Mode</span>
            </div>
          </div>

          <div className="company-edit-hero-content">
            <div className="company-edit-brand">
              <BrandLogo className="company-edit-brand-logo" surface="dark" />
              <div>
                <p>DDO One</p>
                <h1>Company Details Edit</h1>
              </div>
            </div>
            <p className="company-edit-lead">
              Update your registered company information in a full-page DDO One workflow. Changes stay pending until admin approval.
            </p>
          </div>
        </header>

        <section className="company-edit-status-bar">
          <div className="company-edit-status-item">
            <ShieldCheck size={16} />
            <span>Password verification is required before edit mode opens.</span>
          </div>
          <div className="company-edit-status-item">
            <FileText size={16} />
            <span>Submitting this page creates an approval request instead of directly updating MongoDB.</span>
          </div>
        </section>

        {isLoading ? (
          <div className="company-edit-loading">
            <LoaderCircle size={18} className="wifi-action-spinner" />
            <span>Loading current company details...</span>
          </div>
        ) : null}

        {!isLoading && error ? (
          <div className="company-edit-alert is-error">{error}</div>
        ) : null}

        {!isLoading && status ? (
          <div className="company-edit-alert is-success">{status}</div>
        ) : null}

        {!isLoading && !error ? (
          <form className="company-edit-form" onSubmit={handleSubmit}>
            {sectionFields.map((section) => (
              <section key={section.title} className="company-edit-card">
                <div className="company-edit-card-header">
                  <div>
                    <h2>{section.title}</h2>
                    <p>{section.description}</p>
                  </div>
                </div>

                <div className="company-edit-grid">
                  {section.fields.map(([field, label, type]) => (
                    <label
                      key={field}
                      className={`company-edit-field ${type === 'textarea' ? 'is-wide' : ''}`}
                    >
                      <span>{label}</span>
                      {type === 'textarea' ? (
                        <textarea
                          value={form[field] || ''}
                          onChange={(event) => handleFieldChange(field, event.target.value)}
                          rows={field === 'companyDetails' ? 5 : 3}
                        />
                      ) : (
                        <input
                          type={type}
                          value={form[field] || ''}
                          onChange={(event) => handleFieldChange(field, event.target.value)}
                        />
                      )}
                    </label>
                  ))}
                </div>
              </section>
            ))}

            <section className="company-edit-card">
              <div className="company-edit-card-header">
                <div>
                  <h2>Supporting Files</h2>
                  <p>Keep the existing files visible and replace them only when you need to upload updated documents.</p>
                </div>
              </div>

              <div className="company-edit-upload-grid">
                {[
                  ['companyLogo', 'Company logo'],
                  ['companyPhoto', 'Company photo'],
                  ['companyRegisteredProof', 'Company registered proof'],
                ].map(([field, label]) => (
                  <div key={field} className="company-edit-upload-card">
                    <div className="company-edit-upload-header">
                      <strong>{label}</strong>
                      <span>Optional replacement upload</span>
                    </div>
                    <AssetPreview asset={form[field]} label={label} />
                    <label className="company-edit-upload-button">
                      <Upload size={15} />
                      <span>Choose file</span>
                      <input
                        type="file"
                        hidden
                        accept={field === 'companyRegisteredProof' ? '.pdf,.jpg,.jpeg,.png,.webp' : 'image/*,.pdf'}
                        onChange={(event) => void handleFileChange(field, event.target.files?.[0])}
                      />
                    </label>
                  </div>
                ))}
              </div>
            </section>

            <div className="company-edit-actions">
              <button type="button" className="company-edit-secondary" onClick={handleBackToCfm}>
                Cancel
              </button>
              <button type="submit" className="company-edit-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Submitting edit request...' : 'Submit Edit Request'}
              </button>
            </div>
          </form>
        ) : null}
      </section>
    </main>
  );
}

export default CompanyDetailsEditPage;
