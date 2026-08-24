import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { Building, Mail, AlertCircle, ArrowLeft, CheckCircle } from 'lucide-react';

export const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) {
        setError(resetError.message);
      } else {
        setSuccess(true);
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
          <h3 className="text-2xl font-bold text-slate-900">Reset Password</h3>
          <p className="text-slate-500 mt-2 text-sm">
            Enter your email and we'll send you instructions to reset your password.
          </p>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl flex items-start space-x-2.5">
            <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <span className="text-sm font-medium leading-tight">{error}</span>
          </div>
        )}

        {success ? (
          <div className="space-y-6">
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-4 rounded-xl flex flex-col items-center text-center space-y-2">
              <CheckCircle className="h-10 w-10 text-emerald-600 flex-shrink-0" />
              <h4 className="font-bold">Reset Email Sent</h4>
              <p className="text-sm text-emerald-700">
                Check your inbox for a message containing your password reset link.
              </p>
            </div>

            <Link
              to="/login"
              className="w-full flex items-center justify-center px-4 py-3 bg-slate-950 hover:bg-slate-900 text-white rounded-xl text-sm font-semibold shadow-md transition-all"
            >
              Return to Login
            </Link>
          </div>
        ) : (
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-slate-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                <span>Send Reset Link</span>
              )}
            </button>

            <div className="text-center pt-2">
              <Link
                to="/login"
                className="inline-flex items-center text-sm font-semibold text-slate-600 hover:text-indigo-600 transition-colors"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
