import { useEffect } from 'react';
import StatusBar from './components/StatusBar';
import AppErrorBoundary from './components/AppErrorBoundary';
import ToolbarErrorBoundary from './components/ToolbarErrorBoundary';
import CompanyDetailsEditPage from './pages/CompanyDetailsEditPage';
import SpotifyCallbackPage from './pages/SpotifyCallbackPage';
import CompanyLoginPage from './pages/CompanyLoginPage';
import DdoUpdatePage from './pages/DdoUpdatePage';

function App() {
  const isCompanyEditRoute = typeof window !== 'undefined'
    && window.location.pathname === '/cfm/company-details-edit';

  const isCallbackRoute = typeof window !== 'undefined'
    && window.location.pathname === '/callback';

  const isCompanyLoginRoute = typeof window !== 'undefined'
    && (window.location.pathname === '/company-login' || window.location.hash === '#/company-login' || window.location.hash === '#company-login');

  const isUpdateRoute = typeof window !== 'undefined'
    && (window.location.pathname === '/ddo-update' || window.location.hash === '#/ddo-update' || window.location.hash === '#ddo-update');

  const isToolbarRoute = typeof window !== 'undefined'
    && (window.location.pathname === '/toolbar' || window.location.hash === '#/toolbar' || window.location.hash === '#toolbar');

  useEffect(() => {
    if (isToolbarRoute) {
      document.documentElement.classList.add('ddo-toolbar-route');
      document.body.classList.add('ddo-toolbar-route');
    } else {
      document.documentElement.classList.remove('ddo-toolbar-route');
      document.body.classList.remove('ddo-toolbar-route');
    }
  }, [isToolbarRoute]);

  if (isCallbackRoute) {
    return (
      <AppErrorBoundary>
        <SpotifyCallbackPage />
      </AppErrorBoundary>
    );
  }

  if (isCompanyLoginRoute) {
    return (
      <AppErrorBoundary>
        <CompanyLoginPage />
      </AppErrorBoundary>
    );
  }

  if (isUpdateRoute) {
    return (
      <AppErrorBoundary>
        <DdoUpdatePage />
      </AppErrorBoundary>
    );
  }

  if (isToolbarRoute) {
    return (
      <ToolbarErrorBoundary>
        <StatusBar />
      </ToolbarErrorBoundary>
    );
  }

  return (
    <AppErrorBoundary>
      {isCompanyEditRoute ? <CompanyDetailsEditPage /> : (isUpdateRoute ? <DdoUpdatePage /> : <StatusBar />)}
    </AppErrorBoundary>
  );
}

export default App;

