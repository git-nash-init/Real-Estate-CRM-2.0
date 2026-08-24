import React from 'react';
import { useLocation } from 'react-router-dom';
import { Shield, Hammer, Clock } from 'lucide-react';

export const PlaceholderPage: React.FC = () => {
  const location = useLocation();

  // Convert pathname to title (e.g. /channel-partners -> Channel Partners)
  const getPageTitle = () => {
    const segment = location.pathname.substring(1);
    if (!segment) return 'Module';
    return segment
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-8 min-h-[500px] flex flex-col items-center justify-center text-center shadow-sm">
      <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center mb-6 text-indigo-600 shadow-sm">
        <Hammer className="h-8 w-8 text-indigo-600" />
      </div>
      
      <h3 className="text-2xl font-bold text-slate-900 mb-2">{getPageTitle()} Module</h3>
      <p className="text-slate-500 max-w-md text-sm leading-relaxed mb-6">
        This panel is configured in the sidebar and registered inside the application's role-based navigation architecture. It is fully ready to connect to its corresponding Supabase table schema.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg w-full bg-slate-50 border border-slate-200/60 p-4 rounded-xl text-left">
        <div className="flex items-start space-x-3">
          <Shield className="h-5 w-5 text-indigo-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-xs text-slate-800">RBAC Enabled</h4>
            <p className="text-slate-400 text-xxs mt-0.5">Authorization claims are linked to this route controller.</p>
          </div>
        </div>
        <div className="flex items-start space-x-3">
          <Clock className="h-5 w-5 text-indigo-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-xs text-slate-800">Queue Status</h4>
            <p className="text-slate-400 text-xxs mt-0.5">Scheduled for implementation in version 2 scope.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
