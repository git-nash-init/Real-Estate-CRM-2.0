import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { buildScopeContext, scopeFilter } from '../services/dataScope';
import type { ScopeContext } from '../services/dataScope';
import {
  Search,
  UserCheck,
  Building2,
  Home,
  CalendarCheck,
  CreditCard,
  Users,
  Megaphone,
  Briefcase,
  ClipboardCheck,
  CheckSquare,
  BarChart3,
  Settings,
  Handshake,
  PhoneCall,
  MapPin,
  LayoutDashboard,
  Loader2,
} from 'lucide-react';

// Feature/page suggestions — kept in sync with AppLayout's navigationItems
// (including its allowedRoles gates) so a role never gets suggested a page
// it can't actually open.
const FEATURES = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard, keywords: 'home overview' },
  { name: 'Leads', path: '/leads', icon: UserCheck, keywords: 'lead prospect enquiry' },
  { name: 'Follow-ups', path: '/follow-ups', icon: PhoneCall, keywords: 'followup call reminder' },
  { name: 'Site Visits', path: '/site-visits', icon: MapPin, keywords: 'visit schedule' },
  { name: 'Projects', path: '/projects', icon: Building2, keywords: 'project towers phases' },
  { name: 'Inventory', path: '/inventory', icon: Home, keywords: 'unit flat inventory tower' },
  { name: 'Bookings', path: '/bookings', icon: CalendarCheck, keywords: 'booking sale deal' },
  { name: 'Payments', path: '/payments', icon: CreditCard, keywords: 'payment installment receipt' },
  { name: 'Channel Partners', path: '/channel-partners', icon: Users, keywords: 'cp broker agent partner' },
  { name: 'CP Outreach', path: '/cp-outreach', icon: Handshake, keywords: 'outreach channel partner whatsapp' },
  { name: 'Marketing', path: '/marketing', icon: Megaphone, keywords: 'whatsapp campaign broadcast marketing' },
  { name: 'Employees', path: '/employees', icon: Briefcase, keywords: 'employee staff onboarding hr', allowedRoles: ['super_admin', 'project_admin'] },
  { name: 'Attendance', path: '/attendance', icon: ClipboardCheck, keywords: 'attendance leave checkin checkout' },
  { name: 'Tasks', path: '/tasks', icon: CheckSquare, keywords: 'task todo assignment' },
  { name: 'Reports', path: '/reports', icon: BarChart3, keywords: 'report analytics dashboard', allowedRoles: ['super_admin', 'project_admin'] },
  { name: 'Settings', path: '/settings', icon: Settings, keywords: 'settings whatsapp session config', allowedRoles: ['super_admin', 'project_admin'] },
];

interface RecordResult {
  id: string;
  label: string;
  sublabel: string;
  path: string;
}

interface ResultGroups {
  leads: RecordResult[];
  bookings: RecordResult[];
  channelPartners: RecordResult[];
  projects: RecordResult[];
  inventory: RecordResult[];
}

const EMPTY_GROUPS: ResultGroups = { leads: [], bookings: [], channelPartners: [], projects: [], inventory: [] };

export const GlobalSearch: React.FC = () => {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<ResultGroups>(EMPTY_GROUPS);
  const scopeCtxRef = useRef<ScopeContext | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolve this user's scope context (employee id / CP id / assigned
  // projects) once per session rather than on every keystroke.
  useEffect(() => {
    if (!user) return;
    buildScopeContext(user.id, role).then((ctx) => {
      scopeCtxRef.current = ctx;
    });
  }, [user, role]);

  const matchedFeatures = query.trim().length
    ? FEATURES.filter((f) => {
        if (f.allowedRoles && !(role && f.allowedRoles.includes(role))) return false;
        const q = query.trim().toLowerCase();
        return f.name.toLowerCase().includes(q) || f.keywords.includes(q);
      }).slice(0, 5)
    : [];

  const runSearch = useCallback(async (q: string) => {
    const ctx = scopeCtxRef.current;
    if (!ctx || !q.trim()) {
      setGroups(EMPTY_GROUPS);
      return;
    }
    setLoading(true);
    const term = `%${q.trim()}%`;

    const applyScope = (query_: any, table: 'leads' | 'bookings' | 'channel_partners' | 'projects' | 'project_inventory') => {
      const f = scopeFilter(table, ctx);
      if (f === 'ALL') return query_;
      if (f === null) return null; // nothing to show for this table
      return query_.or(f);
    };

    try {
      const leadsQ = applyScope(
        supabase.from('leads').select('id, customer_name, mobile, status').or(`customer_name.ilike.${term},mobile.ilike.${term},email.ilike.${term}`).limit(5),
        'leads'
      );
      const bookingsQ = applyScope(
        supabase.from('bookings').select('id, booking_number, status').ilike('booking_number', term).limit(5),
        'bookings'
      );
      const cpQ = applyScope(
        supabase.from('channel_partners').select('id, name, company_name').or(`name.ilike.${term},company_name.ilike.${term}`).limit(5),
        'channel_partners'
      );
      const projectsQ = applyScope(
        supabase.from('projects').select('id, project_name, project_code').or(`project_name.ilike.${term},project_code.ilike.${term}`).limit(5),
        'projects'
      );
      const invQ = applyScope(
        supabase.from('project_inventory').select('id, unit_number, configuration, project_id').ilike('unit_number', term).limit(5),
        'project_inventory'
      );

      const [leadsRes, bookingsRes, cpRes, projectsRes, invRes] = await Promise.all([
        leadsQ ? leadsQ : Promise.resolve({ data: [], error: null }),
        bookingsQ ? bookingsQ : Promise.resolve({ data: [], error: null }),
        cpQ ? cpQ : Promise.resolve({ data: [], error: null }),
        projectsQ ? projectsQ : Promise.resolve({ data: [], error: null }),
        invQ ? invQ : Promise.resolve({ data: [], error: null }),
      ]);

      setGroups({
        leads: (leadsRes.data || []).map((l: any) => ({
          id: l.id,
          label: l.customer_name || l.mobile || 'Lead',
          sublabel: [l.mobile, l.status].filter(Boolean).join(' · '),
          path: '/leads',
        })),
        bookings: (bookingsRes.data || []).map((b: any) => ({
          id: b.id,
          label: b.booking_number || 'Booking',
          sublabel: b.status || '',
          path: '/bookings',
        })),
        channelPartners: (cpRes.data || []).map((c: any) => ({
          id: c.id,
          label: c.name || c.company_name || 'Channel Partner',
          sublabel: c.company_name || '',
          path: `/channel-partners/${c.id}`,
        })),
        projects: (projectsRes.data || []).map((p: any) => ({
          id: p.id,
          label: p.project_name || p.project_code || 'Project',
          sublabel: p.project_code || '',
          path: '/projects',
        })),
        inventory: (invRes.data || []).map((i: any) => ({
          id: i.id,
          label: i.unit_number || 'Unit',
          sublabel: i.configuration || '',
          path: '/inventory',
        })),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const onChange = (value: string) => {
    setQuery(value);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(value), 300);
  };

  const hasRecordResults =
    groups.leads.length + groups.bookings.length + groups.channelPartners.length + groups.projects.length + groups.inventory.length > 0;

  const goTo = (path: string) => {
    setOpen(false);
    setQuery('');
    navigate(path);
  };

  const renderGroup = (title: string, items: RecordResult[]) => {
    if (!items.length) return null;
    return (
      <div className="py-1">
        <p className="px-4 pt-1.5 pb-0.5 text-xxs text-slate-400 font-semibold uppercase">{title}</p>
        {items.map((item) => (
          <button
            key={`${title}-${item.id}`}
            onClick={() => goTo(item.path)}
            className="w-full text-left px-4 py-2 hover:bg-slate-50 transition-colors"
          >
            <p className="text-sm font-medium text-slate-800 truncate">{item.label}</p>
            {item.sublabel && <p className="text-xxs text-slate-400 truncate">{item.sublabel}</p>}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="relative hidden md:block">
      <div className="flex items-center bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 w-64 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
        <Search className="h-4 w-4 text-slate-400 mr-2 flex-shrink-0" />
        <input
          type="text"
          placeholder="Global search..."
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          className="bg-transparent border-none text-sm w-full focus:outline-none text-slate-700"
        />
        {loading && <Loader2 className="h-3.5 w-3.5 text-slate-400 animate-spin flex-shrink-0" />}
      </div>

      {open && query.trim().length > 0 && (
        <>
          <div onClick={() => setOpen(false)} className="fixed inset-0 z-30 cursor-default" />
          <div className="absolute left-0 mt-2 w-96 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-40 max-h-[440px] overflow-y-auto">
            {matchedFeatures.length > 0 && (
              <div className="py-1 border-b border-slate-100">
                <p className="px-4 pt-1.5 pb-0.5 text-xxs text-slate-400 font-semibold uppercase">Pages</p>
                {matchedFeatures.map((f) => (
                  <button
                    key={f.path}
                    onClick={() => goTo(f.path)}
                    className="w-full flex items-center gap-2.5 text-left px-4 py-2 hover:bg-slate-50 transition-colors"
                  >
                    <f.icon className="h-4 w-4 text-slate-400 flex-shrink-0" />
                    <span className="text-sm font-medium text-slate-800">{f.name}</span>
                  </button>
                ))}
              </div>
            )}

            {renderGroup('Leads', groups.leads)}
            {renderGroup('Bookings', groups.bookings)}
            {renderGroup('Channel Partners', groups.channelPartners)}
            {renderGroup('Projects', groups.projects)}
            {renderGroup('Inventory', groups.inventory)}

            {!loading && !hasRecordResults && matchedFeatures.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-slate-400 italic">No results found.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
};
