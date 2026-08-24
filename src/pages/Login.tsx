import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Building, Lock, Mail, AlertCircle, ArrowRight, Eye, EyeOff } from 'lucide-react';

export const Login: React.FC = () => {
  const { login, user } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // If already logged in, redirect immediately
  React.useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const { error: loginError } = await login(email, password);
      if (loginError) {
        setError(loginError.message || 'Invalid login credentials.');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Left side panel - CRM Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-900 text-white relative overflow-hidden flex-col justify-between p-12">
        {/* Decorative Grid Patterns */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <svg width="100%" height="100%">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        {/* Brand Name */}
        <div className="flex items-center space-x-3 z-10">
          <div className="bg-indigo-600 p-2.5 rounded-xl text-white">
            <Building className="h-6 w-6" />
          </div>
          <span className="font-bold text-xl tracking-wider">EstateCRM</span>
        </div>

        {/* Content */}
        <div className="my-auto max-w-lg z-10 space-y-6">
          <h2 className="text-4xl font-extrabold leading-tight text-white">
            Simplify Your Real Estate Operations.
          </h2>
          <p className="text-slate-400 text-lg leading-relaxed">
            The next-generation CRM for lead management, team coordination, inventory tracking, and sales operations. Track campaigns, view live properties, and manage bookings seamlessly in one central hub.
          </p>
          <div className="flex items-center space-x-4 pt-4">
            <div className="flex -space-x-2">
              <span className="inline-block h-8 w-8 rounded-full bg-slate-700 ring-2 ring-slate-900 border border-slate-600 flex items-center justify-center text-xs font-semibold text-white">SM</span>
              <span className="inline-block h-8 w-8 rounded-full bg-indigo-600 ring-2 ring-slate-900 border border-indigo-400 flex items-center justify-center text-xs font-semibold text-white">CP</span>
              <span className="inline-block h-8 w-8 rounded-full bg-slate-700 ring-2 ring-slate-900 border border-slate-600 flex items-center justify-center text-xs font-semibold text-white">SA</span>
            </div>
            <span className="text-sm font-medium text-slate-400">
              Trusted by 14+ specific agent and management roles.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="z-10 text-xs text-slate-500">
          &copy; {new Date().getFullYear()} EstateCRM Inc. All rights reserved.
        </div>
      </div>

      {/* Right side panel - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-16">
        <div className="w-full max-w-md space-y-8 bg-white p-8 sm:p-10 rounded-2xl shadow-xl border border-slate-100">
          <div className="text-center lg:text-left">
            <div className="lg:hidden flex justify-center mb-6">
              <div className="bg-indigo-600 p-2.5 rounded-xl text-white">
                <Building className="h-6 w-6" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-slate-900">Welcome Back</h3>
            <p className="text-slate-500 mt-2 text-sm">
              Please enter your credentials to log in to the CRM dashboard.
            </p>
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl flex items-start space-x-2.5 animate-in fade-in duration-200">
              <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
              <span className="text-sm font-medium leading-tight">{error}</span>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* Email Field */}
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

            {/* Password Field */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="password" className="block text-sm font-semibold text-slate-700">
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="block w-full pl-10 pr-10 py-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 focus:outline-none transition-all disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold shadow-md shadow-slate-900/10 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <span className="flex items-center">
                  Login to Account
                  <ArrowRight className="ml-2 h-4 w-4" />
                </span>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
