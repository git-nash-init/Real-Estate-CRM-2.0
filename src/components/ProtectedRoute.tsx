import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  /** Denylist -- use when a route stays open to most roles but a specific
      one (e.g. channel_partner) must not reach it via direct URL, even
      though it isn't shown in their sidebar. */
  excludedRoles?: string[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, excludedRoles }) => {
  const { user, profile, role, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
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
  if ((allowedRoles && !(role && allowedRoles.includes(role))) || (excludedRoles && role && excludedRoles.includes(role))) {
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
