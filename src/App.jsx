import StatusBar from './components/StatusBar';
import AppErrorBoundary from './components/AppErrorBoundary';
import CompanyDetailsEditPage from './pages/CompanyDetailsEditPage';

function App() {
  const isCompanyEditRoute = typeof window !== 'undefined'
    && window.location.pathname === '/cfm/company-details-edit';

  return (
    <AppErrorBoundary>
      {isCompanyEditRoute ? <CompanyDetailsEditPage /> : <StatusBar />}
    </AppErrorBoundary>
  );
}

export default App;
