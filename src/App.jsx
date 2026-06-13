import { useEffect } from 'react';
import StatusBar from './components/StatusBar';
import AppErrorBoundary from './components/AppErrorBoundary';
import ToolbarErrorBoundary from './components/ToolbarErrorBoundary';
import CompanyDetailsEditPage from './pages/CompanyDetailsEditPage';

function App() {
  const isCompanyEditRoute = typeof window !== 'undefined'
    && window.location.pathname === '/cfm/company-details-edit';

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

  if (isToolbarRoute) {
    return (
      <ToolbarErrorBoundary>
        <StatusBar />
      </ToolbarErrorBoundary>
    );
  }

  return (
    <AppErrorBoundary>
      {isCompanyEditRoute ? <CompanyDetailsEditPage /> : <StatusBar />}
    </AppErrorBoundary>
  );
}

export default App;

