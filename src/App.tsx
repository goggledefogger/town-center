import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { AuthGuard } from './features/auth/AuthGuard'
import { LoginPage } from './features/auth/LoginPage'
import { Layout } from './components/Layout'
import { TokensPage } from './features/tokens'
import { ProjectsPage, ProjectDetailPage, WorkstreamDetailPage } from './features/projects'

function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
        Settings
      </h1>
      <p className="text-gray-600 dark:text-gray-400">
        Configure your dashboard preferences.
      </p>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/*"
            element={
              <AuthGuard>
                <Layout>
                  <Routes>
                    <Route path="/" element={<ProjectsPage />} />
                    <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
                    <Route path="/projects/:projectId/workstreams/:workstreamId" element={<WorkstreamDetailPage />} />
                    <Route path="/tokens" element={<TokensPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                  </Routes>
                </Layout>
              </AuthGuard>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
