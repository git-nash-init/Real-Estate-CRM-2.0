import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './layouts/AppLayout';
import { Login } from './pages/Login';
import { ForgotPassword } from './pages/ForgotPassword';
import { Dashboard } from './pages/Dashboard';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { Leads } from './pages/Leads';
import { Followups } from './pages/Followups';
import { SiteVisits } from './pages/SiteVisits';
import { Bookings } from './pages/Bookings';
import { Projects } from './pages/Projects';
import { Inventory } from './pages/Inventory';
import { Payments } from './pages/Payments';
import { ChannelPartners } from './pages/ChannelPartners';
import { ChannelPartnerDetails } from './pages/ChannelPartnerDetails';
import { CPOutreach } from './pages/CPOutreach';
import { Employees } from './pages/Employees';
import { Marketing } from './pages/Marketing';
import { Tasks } from './pages/Tasks';
import { Attendance } from './pages/Attendance';
import { Reports } from './pages/Reports';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Authentication Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          {/* Secure Admin Workspace Routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            {/* Dashboard main view */}
            <Route index element={<Dashboard />} />

            {/* Sidebar navigation stubs */}
            <Route path="leads" element={<Leads />} />
            <Route path="follow-ups" element={<Followups />} />
            <Route path="site-visits" element={<SiteVisits />} />
            <Route path="projects" element={<Projects />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="bookings" element={<Bookings />} />
            <Route path="payments" element={<Payments />} />
            <Route path="channel-partners" element={<ChannelPartners />} />
            <Route path="channel-partners/:id" element={<ChannelPartnerDetails />} />
            <Route path="cp-outreach" element={<CPOutreach />} />
            <Route path="marketing" element={<Marketing />} />
            <Route path="employees" element={<Employees />} />
            <Route path="attendance" element={<Attendance />} />
            <Route path="tasks" element={<Tasks />} />
            <Route
              path="reports"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'project_admin']}>
                  <Reports />
                </ProtectedRoute>
              }
            />
            <Route path="settings" element={<PlaceholderPage />} />

            {/* Catch-all redirected back to dashboard */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
