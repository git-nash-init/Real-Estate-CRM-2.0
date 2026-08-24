import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { Building, Lock, AlertCircle, ShieldCheck } from 'lucide-react';

// Shown instead of the normal app when user_profiles.must_change_password
// is true — the account was created by an admin with a random one-time
// password (Employees.tsx), and this forces a real password to be set
// before the account can be used for anything else.
export const SetPassword: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      if (updateError) throw updateError;

      if (user) {
        const { error: profileError } = await supabase
          .from('user_profiles')
          .update({ must_change_password: false })
          .eq('id', user.id);
        if (profileError) throw profileError;
      }

      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Failed to set password.');
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
          <h3 className="text-2xl font-bold text-slate-900">Set Your Password</h3>
          <p className="text-slate-500 mt-2 text-sm">
            Your account was created with a temporary password. Choose your own before continuing.
          </p>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl flex items-start space-x-2.5">
            <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <span className="text-sm font-medium leading-tight">{error}</span>
          </div>
        )}

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
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-indigo-600/10 hover:shadow-lg focus:outline-none disabled:opacity-50 transition-all"
          >
            {loading ? (
              <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <><ShieldCheck className="h-4 w-4" /> Set Password &amp; Continue</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
