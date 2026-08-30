import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './layouts/AppLayout';
import { Login } from './pages/Login';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { SetPassword } from './pages/SetPassword';
import { Dashboard } from './pages/Dashboard';
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
import { Settings } from './pages/Settings';
import { Expenses } from './pages/Expenses';
import { BulkUploads } from './pages/BulkUploads';
import { canAccessBulkUploadPage } from './utils/permissions';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Authentication Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Forced first-login password change — protected (must be
              logged in) but deliberately outside AppLayout/the must-change
              redirect below, so it's reachable without a chicken-and-egg loop. */}
          <Route
            path="/set-password"
            element={
              <ProtectedRoute>
                <SetPassword />
              </ProtectedRoute>
            }
          />

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
            {/* Channel Partner scoping (client's explicit "nothing else"
                requirement): these routes were reachable by a CP via direct
                URL even though the sidebar hid them (route-level guards
                previously only existed for Employees/Expenses). RLS is the
                real data boundary, but Follow-ups/Site Visits/Projects/
                Inventory/the full Channel Partners directory/CP Outreach/
                Marketing carry no meaningful CP-scoped view, so they're
                excluded outright rather than rendered empty. */}
            <Route path="follow-ups" element={<ProtectedRoute excludedRoles={['channel_partner']}><Followups /></ProtectedRoute>} />
            {/* Channel partners get in here for the Walk-in Visits section
                only -- SiteVisits.tsx itself hides the formal scheduled
                Site Visits directory for that role. */}
            <Route path="site-visits" element={<SiteVisits />} />
            <Route path="projects" element={<ProtectedRoute excludedRoles={['channel_partner']}><Projects /></ProtectedRoute>} />
            <Route path="inventory" element={<ProtectedRoute excludedRoles={['channel_partner']}><Inventory /></ProtectedRoute>} />
            <Route path="bookings" element={<Bookings />} />
            {/* Presales has no access to Payments at all per the client --
                matches the Payments nav item's hiddenForRoles. */}
            <Route path="payments" element={<ProtectedRoute excludedRoles={['presales']}><Payments /></ProtectedRoute>} />
            <Route path="channel-partners" element={<ProtectedRoute excludedRoles={['channel_partner']}><ChannelPartners /></ProtectedRoute>} />
            <Route path="channel-partners/:id" element={<ProtectedRoute excludedRoles={['channel_partner']}><ChannelPartnerDetails /></ProtectedRoute>} />
            <Route path="cp-outreach" element={<ProtectedRoute excludedRoles={['channel_partner', 'closing_manager', 'presales']}><CPOutreach /></ProtectedRoute>} />
            <Route path="marketing" element={<ProtectedRoute excludedRoles={['channel_partner']}><Marketing /></ProtectedRoute>} />
            {/* Account/credential management — restricted to super_admin
                only per the client's explicit request: creating logins,
                sharing credentials, and activating/deactivating accounts
                should not be a project_admin capability. */}
            <Route
              path="employees"
              element={
                <ProtectedRoute allowedRoles={['super_admin']}>
                  <Employees />
                </ProtectedRoute>
              }
            />
            {/* Personal expense ledger — super_admin only at the route level;
                the real boundary is the personal_expenses RLS policy, which
                additionally scopes each super_admin to their own rows only. */}
            <Route
              path="expenses"
              element={
                <ProtectedRoute allowedRoles={['super_admin']}>
                  <Expenses />
                </ProtectedRoute>
              }
            />
            <Route path="attendance" element={<ProtectedRoute excludedRoles={['channel_partner']}><Attendance /></ProtectedRoute>} />
            <Route path="tasks" element={<ProtectedRoute excludedRoles={['channel_partner']}><Tasks /></ProtectedRoute>} />
            {/* Open to every role now — Reports.tsx itself decides what a
                given user sees (full business view for admins, a
                bifurcated team view for site_head/TLs, a personal view for
                everyone else, a referral view for channel partners). */}
            <Route
              path="reports"
              element={<Reports />}
            />
            <Route
              path="settings"
              element={<ProtectedRoute excludedRoles={['channel_partner']}><Settings /></ProtectedRoute>}
            />
            <Route
              path="bulk-uploads"
              element={<ProtectedRoute isAllowed={canAccessBulkUploadPage}><BulkUploads /></ProtectedRoute>}
            />

            {/* Catch-all redirected back to dashboard */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
