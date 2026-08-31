import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { reportQueryError } from '../services/queryLogger';
import { useAuth } from '../hooks/useAuth';
import {
  Settings as SettingsIcon,
  MessageSquare,
  QrCode,
  LogOut,
  RefreshCw,
  AlertTriangle,
  KeyRound,
  CheckCircle,
} from 'lucide-react';

interface WhatsAppSession {
  id: string;
  status: string;
  qr_data_url: string | null;
  connected_phone: string | null;
  pending_command: string | null;
  last_heartbeat_at: string | null;
  updated_at: string;
}

const statusMeta: Record<string, { label: string; color: string; dot: string }> = {
  open: { label: 'Connected', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  qr_pending: { label: 'Awaiting QR Scan', color: 'text-amber-700 bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
  connecting: { label: 'Connecting...', color: 'text-slate-600 bg-slate-50 border-slate-200', dot: 'bg-slate-400' },
  logged_out: { label: 'Logged Out', color: 'text-rose-700 bg-rose-50 border-rose-200', dot: 'bg-rose-500' },
  disconnected: { label: 'Gateway Offline', color: 'text-slate-500 bg-slate-50 border-slate-200', dot: 'bg-slate-300' },
};

const WhatsAppPanel: React.FC = () => {
  const { user } = useAuth();
  const [session, setSession] = useState<WhatsAppSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [isStale, setIsStale] = useState(true);

  const fetchSession = useCallback(async () => {
    if (!user?.id) return;
    let { data, error } = await supabase.from('whatsapp_session').select('*').eq('id', user.id).maybeSingle();
    
    if (error) {
      reportQueryError('Settings: WhatsApp session fetch', error);
    } else if (!data) {
      // Auto-initialize row for new users so the gateway picks it up.
      // Set last_heartbeat_at to now so it says "Connecting..." instead of "Offline" 
      // for the first 20 seconds while waiting for the gateway to pick it up.
      const { data: newData, error: insertError } = await supabase
        .from('whatsapp_session')
        .insert([{ id: user.id, status: 'connecting', last_heartbeat_at: new Date().toISOString() }])
        .select()
        .single();
      
      if (insertError) {
        reportQueryError('Settings: WhatsApp session init', insertError);
      } else {
        data = newData;
      }
    }
    
    setSession(data);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { fetchSession(); }, [fetchSession]);

  // Live updates — the gateway heartbeats into this row every few seconds,
  // so a fresh QR code or a status change (connected, logged out) shows up
  // here without any manual refresh.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`whatsapp-session-live-${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'whatsapp_session', filter: `id=eq.${user.id}` }, (payload) => {
        setSession(payload.new as WhatsAppSession);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // If the gateway process isn't running at all, its heartbeat stops
  // updating last_heartbeat_at — detect that as "offline" rather than
  // trusting a stale "Connected" status forever. Recomputed on a timer
  // (rather than reading Date.now() directly during render) so it stays
  // accurate even when no new heartbeat row arrives to trigger a render.
  useEffect(() => {
    const recompute = () => {
      setIsStale(session?.last_heartbeat_at
        ? Date.now() - new Date(session.last_heartbeat_at).getTime() > 20000
        : true);
    };
    recompute();
    const interval = setInterval(recompute, 2000);
    return () => clearInterval(interval);
  }, [session?.last_heartbeat_at]);

  const effectiveStatus = isStale ? 'disconnected' : (session?.status || 'disconnected');
  const meta = statusMeta[effectiveStatus] || statusMeta.disconnected;

  const handleLogout = async () => {
    if (!user?.id) return;
    setLoggingOut(true);
    const { error } = await supabase
      .from('whatsapp_session')
      .update({ pending_command: 'logout' })
      .eq('id', user.id);
    if (error) reportQueryError('Settings: WhatsApp logout', error);
    setLoggingOut(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="h-5 w-5 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-800 mb-1 flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-indigo-600" /> WhatsApp Connection
      </h3>
      <p className="text-xs text-slate-500 mb-4">
        Used for bulk marketing messages and Channel Partner lead verification codes.
      </p>

      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold mb-4 w-fit ${meta.color}`}>
        <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
        {meta.label}
        {effectiveStatus === 'open' && session?.connected_phone && (
          <span className="text-xs font-normal opacity-75">— {session.connected_phone}</span>
        )}
      </div>

      {isStale && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-xs mb-4">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          The gateway hasn't reported in — it may not be running. Start it with <code className="bg-amber-100 px-1 rounded">npm start</code> in the <code className="bg-amber-100 px-1 rounded">whatsapp-gateway/</code> folder.
        </div>
      )}

      {!isStale && effectiveStatus !== 'open' && session?.qr_data_url && (
        <div className="flex flex-col items-center gap-3 border border-slate-200 rounded-xl p-6 bg-slate-50 max-w-xs">
          <img src={session.qr_data_url} alt="WhatsApp QR code" className="w-52 h-52 rounded-lg border border-slate-200" />
          <p className="text-xs text-slate-500 text-center flex items-center gap-1.5">
            <QrCode className="h-3.5 w-3.5" /> Scan with WhatsApp → Settings → Linked Devices → Link a Device
          </p>
          <p className="text-[10px] text-slate-400 text-center">
            Refreshes automatically every ~20s if not scanned in time — just keep this page open and scan the current code.
          </p>
        </div>
      )}

      {!isStale && effectiveStatus === 'open' && (
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex items-center gap-2 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold disabled:opacity-50"
        >
          <LogOut className="h-3.5 w-3.5" /> {loggingOut ? 'Logging out...' : 'Log Out WhatsApp'}
        </button>
      )}

      {!isStale && (effectiveStatus === 'logged_out' || effectiveStatus === 'connecting') && !session?.qr_data_url && (
        <p className="text-xs text-slate-500">Generating a fresh QR code — this panel updates automatically.</p>
      )}
    </div>
  );
};

// Lets an already-logged-in user set a new password without going through
// the email-based Forgot Password flow — the only way to change a
// password before this existed. Doesn't ask for the current password:
// supabase-js's updateUser() re-uses the already-authenticated session,
// which is the standard pattern for a self-service change (as opposed to
// a password *reset* for someone who's locked out, which is what the
// email flow is for).
const ChangePasswordPanel: React.FC = () => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      setSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-800 mb-1 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-indigo-600" /> Change Password
      </h3>
      <p className="text-xs text-slate-500 mb-4">Set a new password for your own account.</p>

      {success && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3 text-xs mb-4">
          <CheckCircle className="h-4 w-4 flex-shrink-0" /> Password updated. Use it next time you log in.
        </div>
      )}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg px-3 py-2 mb-4">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3 max-w-sm">
        <div>
          <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider mb-1">New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider mb-1">Confirm New Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
        >
          {submitting ? 'Updating...' : 'Update Password'}
        </button>
      </form>
    </div>
  );
};

export const Settings: React.FC = () => {
  const { role } = useAuth();
  const canUseWhatsApp = role === 'super_admin' || role === 'closing_manager' || role === 'closing_manager_tl' || role === 'presales' || role === 'presales_tl';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <SettingsIcon className="h-6 w-6 text-indigo-600" /> Settings
        </h2>
        <p className="text-slate-500 text-xs mt-1">System configuration.</p>
      </div>

      <ChangePasswordPanel />
      {canUseWhatsApp && <WhatsAppPanel />}
    </div>
  );
};
