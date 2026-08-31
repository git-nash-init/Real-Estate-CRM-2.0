import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { Building, Lock, AlertCircle, CheckCircle } from 'lucide-react';

// Reached from the "Send Reset Link" email (ForgotPassword.tsx sets
// redirectTo: `${origin}/reset-password`). Supabase's client auto-detects
// the recovery tokens in the URL hash and establishes a temporary session
// before this component even renders — from here it's just a normal
// updateUser({ password }) call. This route previously did not exist at
// all, so the email link went nowhere and password reset was completely
// non-functional.
export const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState(false);

  useEffect(() => {
    // Give supabase-js a moment to process the recovery tokens from the
    // URL hash and establish a session before we check for one.
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setSessionReady(true);
      } else {
        setSessionError(true);
      }
    };
    check();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
      } else {
        await supabase.auth.signOut();
        setSuccess(true);
        setTimeout(() => navigate('/login'), 3000);
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8 bg-white p-8 sm:p-10 rounded-2xl shadow-xl border border-slate-100">
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <div className="bg-indigo-600 p-2.5 rounded-xl text-white">
              <Building className="h-6 w-6" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-slate-900">Set New Password</h3>
          <p className="text-slate-500 mt-2 text-sm">Choose a new password for your account.</p>
        </div>

        {sessionError && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl flex items-start space-x-2.5">
            <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <span className="text-sm font-medium leading-tight">
              This reset link is invalid or has expired. Request a new one from the{' '}
              <Link to="/forgot-password" className="underline font-semibold">forgot password</Link> page.
            </span>
          </div>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl flex items-start space-x-2.5">
            <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <span className="text-sm font-medium leading-tight">{error}</span>
          </div>
        )}

        {success ? (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-6 py-8 rounded-xl flex flex-col items-center text-center space-y-3">
            <CheckCircle className="h-12 w-12 text-emerald-600 flex-shrink-0" />
            <h4 className="font-bold text-xl">Password Updated!</h4>
            <p className="text-sm text-emerald-700">Your password has been successfully reset. Please log in with your new credentials.</p>
            <button
              onClick={() => navigate('/')}
              className="mt-4 w-full flex items-center justify-center px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-md transition-all"
            >
              Back to Login
            </button>
          </div>
        ) : sessionReady ? (
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-slate-700 mb-2">New Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="block w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 focus:outline-none transition-all disabled:opacity-50"
                />
              </div>
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-semibold text-slate-700 mb-2">Confirm Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  className="block w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 focus:outline-none transition-all disabled:opacity-50"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-indigo-600/10 hover:shadow-lg focus:outline-none disabled:opacity-50 transition-all"
            >
              {loading ? (
                <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <span>Set Password</span>
              )}
            </button>
          </form>
        ) : !sessionError ? (
          <div className="flex justify-center py-6">
            <div className="h-6 w-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
