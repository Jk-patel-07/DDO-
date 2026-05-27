import StatusBar from './components/StatusBar';
import AppErrorBoundary from './components/AppErrorBoundary';

function App() {
  return (
    <AppErrorBoundary>
      <StatusBar />
      {/* Rest of the app would go here */}
    </AppErrorBoundary>
  );
}

export default App;
