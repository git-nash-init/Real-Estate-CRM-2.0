import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { user, profile, role, loading, timedOut } = useAuth();
  const location = useLocation();

  if (loading) {
    // Stuck for 10s+ (a stale tab holding the browser's auth lock, a
    // network call that never resolved) — a spinner that never changes is
    // worse than an honest dead end. A full reload starts a fresh browsing
    // context, which is enough to clear this class of problem.
    if (timedOut) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="max-w-sm w-full bg-white p-8 rounded-xl shadow-lg text-center border border-slate-100">
            <h2 className="text-lg font-bold text-slate-800 mb-2">Taking longer than expected</h2>
            <p className="text-sm text-slate-500 mb-6">Your session is taking too long to verify. This usually clears up with a reload.</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-200 border-t-indigo-600"></div>
          <p className="text-slate-500 font-medium animate-pulse">Verifying secure session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Accounts created with an admin-generated one-time password
  // (Employees.tsx onboarding) must set a real password before doing
  // anything else. Guarded against redirecting /set-password to itself.
  if (profile?.must_change_password && location.pathname !== '/set-password') {
    return <Navigate to="/set-password" replace />;
  }

  // Role based access control (if specified).
  // Deliberately deny when role is null/unresolved, not just when it fails
  // to match — the previous `allowedRoles && role && !...includes(role)`
  // short-circuited to "allow" for any user whose role lookup came back
  // empty (no user_roles row, an RLS hiccup, etc.), letting them straight
  // through every role-gated route including Reports and Settings.
  if (allowedRoles && !(role && allowedRoles.includes(role))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg text-center border border-slate-100">
          <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Access Denied</h2>
          <p className="text-slate-600 mb-6">
            You do not have the required permissions to access this panel.
            {role ? <> Your role: <span className="font-semibold text-slate-700">{role}</span></> : ' No role is assigned to your account — contact an admin.'}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
