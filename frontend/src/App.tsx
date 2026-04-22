import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import DashboardPage from './pages/DashboardPage';
import LearningPage from './pages/LearningPage';
import PracticePage from './pages/PracticePage';
import JourneySetupPage from './pages/JourneySetupPage';
import JourneyPage from './pages/JourneyPage';
import JourneyListPage from './pages/JourneyListPage';
import TestLobbyPage from './pages/TestLobbyPage';
import TestSessionPage from './pages/TestSessionPage';
import TestResultsPage from './pages/TestResultsPage';

function App() {
  return (
    <Router>
      <div className="app-container">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/learning" element={<LearningPage />} />
            <Route path="/learning/:topicId" element={<LearningPage />} />
            <Route path="/practice" element={<PracticePage />} />
            <Route path="/journey/list" element={<JourneyListPage />} />
            <Route path="/journey/new" element={<JourneySetupPage />} />
            <Route path="/journey/:journeyId" element={<JourneyPage />} />
            <Route path="/test" element={<TestLobbyPage />} />
            <Route path="/test/:sessionId" element={<TestSessionPage />} />
            <Route path="/test/results/:reportId" element={<TestResultsPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
