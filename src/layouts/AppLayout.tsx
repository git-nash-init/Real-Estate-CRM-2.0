import React, { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { QueryFailureOverlay } from '../components/QueryFailureOverlay';
import { GlobalSearch } from '../components/GlobalSearch';
import {
  LayoutDashboard,
  UserCheck,
  PhoneCall,
  MapPin,
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
  LogOut,
  User,
  Menu,
  X,
  Building,
  Handshake,
  ChevronDown,
  Bell,
  Wallet
} from 'lucide-react';

export const AppLayout: React.FC = () => {
  const { profile, role, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const { notifications, unreadCount, markAsRead, markAllAsRead, justArrived, dismissJustArrived } = useNotifications();

  const navigationItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Leads', path: '/leads', icon: UserCheck },
    { name: 'Follow-ups', path: '/follow-ups', icon: PhoneCall },
    { name: 'Site Visits', path: '/site-visits', icon: MapPin },
    { name: 'Projects', path: '/projects', icon: Building2 },
    { name: 'Inventory', path: '/inventory', icon: Home },
    { name: 'Bookings', path: '/bookings', icon: CalendarCheck },
    { name: 'Payments', path: '/payments', icon: CreditCard },
    { name: 'Channel Partners', path: '/channel-partners', icon: Users },
    { name: 'CP Outreach', path: '/cp-outreach', icon: Handshake },
    { name: 'Marketing', path: '/marketing', icon: Megaphone },
    { name: 'Employees', path: '/employees', icon: Briefcase, allowedRoles: ['super_admin'] },
    { name: 'Attendance', path: '/attendance', icon: ClipboardCheck },
    { name: 'Tasks', path: '/tasks', icon: CheckSquare },
    { name: 'Reports', path: '/reports', icon: BarChart3, allowedRoles: ['super_admin', 'project_admin'] },
    { name: 'Expenses', path: '/expenses', icon: Wallet, allowedRoles: ['super_admin'] },
    { name: 'Settings', path: '/settings', icon: Settings, allowedRoles: ['super_admin', 'project_admin'] },
  ];

  const handleLogout = async () => {
    const { error } = await logout();
    if (!error) {
      navigate('/login');
    }
  };

  const getPageTitle = () => {
    const currentItem = navigationItems.find(item => item.path === location.pathname);
    return currentItem ? currentItem.name : 'Real Estate CRM';
  };

  // Convert role slug to a clean title case label (e.g. super_admin -> Super Admin)
  const formatRole = (roleStr: string | null) => {
    if (!roleStr) return 'User';
    return roleStr
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-800 font-sans">
      {/* LEFT SIDEBAR */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-20 flex flex-col bg-slate-900 text-slate-300 border-r border-slate-800 transition-all duration-300 ${
          sidebarOpen ? 'w-64' : 'w-20'
        }`}
      >
        {/* Sidebar Header */}
        <div className="h-16 flex items-center justify-between px-4 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="bg-indigo-600 p-2 rounded-lg text-white flex-shrink-0">
              <Building className="h-5 w-5" />
            </div>
            {sidebarOpen && (
              <span className="font-bold text-lg text-white tracking-wider truncate">
                EstateCRM
              </span>
            )}
          </div>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 focus:outline-none transition-colors"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navigationItems
            .filter((item) => !item.allowedRoles || (role && item.allowedRoles.includes(role)))
            .map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.name}
                to={item.path}
                className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/20'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <Icon
                  className={`h-5 w-5 flex-shrink-0 transition-colors ${
                    isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                />
                {sidebarOpen && <span className="truncate">{item.name}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50">
          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-rose-950/30 hover:text-rose-400 transition-colors focus:outline-none"
          >
            <LogOut className="h-5 w-5 flex-shrink-0 text-slate-400 group-hover:text-rose-400" />
            {sidebarOpen && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* RIGHT CONTENT WORKSPACE */}
      <div
        className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${
          sidebarOpen ? 'pl-64' : 'pl-20'
        }`}
      >
        {/* TOP HEADER */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-10 shadow-sm">
          {/* Header Title / Search */}
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              {getPageTitle()}
            </h1>
            <GlobalSearch />
          </div>

          {/* Header Actions & Profile */}
          <div className="flex items-center space-x-4">
            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 focus:outline-none transition-colors relative"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center bg-rose-500 text-white text-[9px] font-bold rounded-full">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifDropdownOpen && (
                <>
                  <div onClick={() => setNotifDropdownOpen(false)} className="fixed inset-0 z-30 cursor-default" />
                  <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-40 max-h-[420px] overflow-y-auto">
                    <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                      <p className="text-xs text-slate-400 font-medium uppercase">Notifications</p>
                      {unreadCount > 0 && (
                        <button onClick={markAllAsRead} className="text-xxs text-indigo-600 font-semibold hover:underline">
                          Mark all read
                        </button>
                      )}
                    </div>
                    {notifications.length === 0 ? (
                      <p className="px-4 py-6 text-center text-xs text-slate-400 italic">No notifications yet.</p>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => markAsRead(n.id)}
                          className={`w-full text-left px-4 py-2.5 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors ${n.is_read ? 'opacity-60' : ''}`}
                        >
                          <div className="flex items-start gap-2">
                            {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-1.5 flex-shrink-0" />}
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-800 truncate">{n.title}</p>
                              <p className="text-xxs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                              <p className="text-[10px] text-slate-350 mt-1">{new Date(n.created_at).toLocaleString('en-IN')}</p>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center space-x-3 p-1.5 rounded-lg hover:bg-slate-100 focus:outline-none transition-colors"
              >
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.full_name || 'User'}
                    className="w-8 h-8 rounded-full border border-slate-200 object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center border border-indigo-200">
                    {profile?.full_name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                )}
                <div className="hidden sm:block text-left">
                  <div className="text-sm font-semibold text-slate-900 truncate max-w-[150px]">
                    {profile?.full_name || 'System User'}
                  </div>
                  <div className="text-xs text-slate-500 font-medium tracking-wide uppercase">
                    {formatRole(role)}
                  </div>
                </div>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>

              {userDropdownOpen && (
                <>
                  <div
                    onClick={() => setUserDropdownOpen(false)}
                    className="fixed inset-0 z-30 cursor-default"
                  />
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-40 animate-in fade-in slide-in-from-top-2 duration-100">
                    <div className="px-4 py-2 border-b border-slate-100">
                      <p className="text-xs text-slate-400 font-medium uppercase">Logged in as</p>
                      <p className="text-sm font-semibold text-slate-800 truncate">{profile?.email}</p>
                    </div>
                    
                    <button
                      onClick={() => {
                        setUserDropdownOpen(false);
                        navigate('/settings');
                      }}
                      className="w-full flex items-center space-x-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors text-left"
                    >
                      <User className="h-4 w-4 text-slate-400" />
                      <span>My Profile Settings</span>
                    </button>
                    
                    <button
                      onClick={() => {
                        setUserDropdownOpen(false);
                        handleLogout();
                      }}
                      className="w-full flex items-center space-x-2.5 px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 transition-colors text-left border-t border-slate-100"
                    >
                      <LogOut className="h-4 w-4 text-rose-500" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* MAIN VIEWPORT */}
        <main className="flex-1 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <QueryFailureOverlay />

      {justArrived && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <Bell className="h-4 w-4 text-indigo-400 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">{justArrived.title}</p>
            <p className="text-slate-300 text-xs">{justArrived.message}</p>
          </div>
          <button onClick={dismissJustArrived} className="ml-2 text-slate-400 hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
