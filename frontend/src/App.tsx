import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import LearningPage from './pages/LearningPage';
import JourneySetupPage from './pages/JourneySetupPage';
import JourneyPage from './pages/JourneyPage';
import JourneyListPage from './pages/JourneyListPage';
import TestLobbyPage from './pages/TestLobbyPage';
import TestSessionPage from './pages/TestSessionPage';
import TestResultsPage from './pages/TestResultsPage';
import OnboardingPage from './pages/OnboardingPage';
import ChapterGraphPage from './pages/ChapterGraphPage';
import LandingPage from './pages/LandingPage';

function AppContent() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      {/* Sidebar-free full page routes */}
      <Route path="/journey/new" element={<JourneySetupPage />} />
      <Route path="/journey/list" element={<JourneyListPage />} />
      <Route path="/journey/:journeyId" element={<JourneyPage />} />
      {/* Dashboard is the main hub — full width */}
      <Route path="/dashboard" element={<DashboardPage />} />
      {/* Sub-pages launched from Dashboard tabs */}
      <Route path="/learning" element={<Navigate to="/dashboard?tab=learn" replace />} />
      <Route path="/learning/chapter/:chapterId/graph" element={<ChapterGraphPage />} />
      <Route path="/learning/:topicId" element={<Navigate to="/dashboard?tab=learn" replace />} />
      <Route path="/test" element={<TestLobbyPage />} />
      <Route path="/test/:sessionId" element={<TestSessionPage />} />
      <Route path="/test/results/:reportId" element={<TestResultsPage />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
