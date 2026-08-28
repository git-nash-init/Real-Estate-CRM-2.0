import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import type { UserProfile, UserRole, UserSession } from '../types/auth';

interface AuthContextType extends UserSession {
  login: (email: string, password: string) => Promise<{ error: any }>;
  logout: () => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const fetchProfileAndRole = async (userId: string, email: string): Promise<{ profile: UserProfile | null; role: UserRole | null; assignedProjects: string[] }> => {
  try {
    const profilePromise = supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    const userRolePromise = supabase
      .from('user_roles')
      .select('role_id')
      .eq('user_id', userId)
      .maybeSingle();

    const assignedProjectsPromise = supabase
      .from('user_project_assignments')
      .select('project_id')
      .eq('user_id', userId)
      .eq('is_active', true);

    // 2.5s safeguard timeout so database latency never hangs auth
    const timeoutPromise = new Promise<{ timeout: true }>((resolve) =>
      setTimeout(() => resolve({ timeout: true }), 2500)
    );

    const [profileRes, userRoleRes, assignedProjectsRes] = await Promise.race([
      Promise.all([profilePromise, userRolePromise, assignedProjectsPromise]),
      timeoutPromise.then(() => [{ data: null, error: null }, { data: null, error: null }, { data: null, error: null }]),
    ]);

    const profile = (profileRes as any)?.data;
    const userRole = (userRoleRes as any)?.data;
    const assignedProjectsData = (assignedProjectsRes as any)?.data || [];
    const assignedProjects = assignedProjectsData.map((row: any) => row.project_id);

    let roleName: UserRole | null = null;

    if (userRole?.role_id) {
      const { data: role } = await supabase
        .from('roles')
        .select('name')
        .eq('id', userRole.role_id)
        .maybeSingle();

      if (role?.name) {
        roleName = role.name as UserRole;
      }
    }

    const finalProfile: UserProfile = profile || {
      id: userId,
      email: email,
      full_name: null,
      avatar_url: null,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return {
      profile: finalProfile,
      role: roleName,
      assignedProjects,
    };
  } catch (err) {
    console.error('Error in fetchProfileAndRole:', err);
    return {
      profile: {
        id: userId,
        email: email,
        full_name: null,
        avatar_url: null,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      role: null,
      assignedProjects: [],
    };
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sessionState, setSessionState] = useState<UserSession>(() => {
    // If no Supabase token exists in localStorage, initialize immediately as unauthenticated
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const hasToken = Object.keys(localStorage).some(
          (k) => k.startsWith('sb-') && k.endsWith('-auth-token')
        );
        if (!hasToken) {
          return { user: null, profile: null, role: null, assignedProjects: [], loading: false };
        }
      }
    } catch {
      // ignore
    }
    return { user: null, profile: null, role: null, assignedProjects: [], loading: true };
  });

  useEffect(() => {
    let mounted = true;
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

    const setupRealtime = (userId: string, userEmail: string) => {
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
      }

      // We listen to user_roles and user_project_assignments for the current user
      realtimeChannel = supabase.channel(`public:auth_changes_\${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'user_roles', filter: `user_id=eq.\${userId}` },
          () => {
            // Refetch roles on any change
            fetchProfileAndRole(userId, userEmail).then(({ profile, role, assignedProjects }) => {
              if (mounted) {
                setSessionState((prev) => ({ ...prev, profile, role, assignedProjects }));
              }
            });
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'user_project_assignments', filter: `user_id=eq.\${userId}` },
          () => {
            // Refetch assigned projects on any change
            fetchProfileAndRole(userId, userEmail).then(({ profile, role, assignedProjects }) => {
              if (mounted) {
                setSessionState((prev) => ({ ...prev, profile, role, assignedProjects }));
              }
            });
          }
        )
        .subscribe();
    };

    const initAuth = async () => {
      try {
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<{ data: { session: null }; error: null }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null }, error: null }), 1200)
        );

        const { data } = await Promise.race([sessionPromise, timeoutPromise]);
        const session = data?.session;

        if (!mounted) return;

        if (!session?.user) {
          setSessionState({
            user: null,
            profile: null,
            role: null,
            assignedProjects: [],
            loading: false,
          });
          return;
        }

        const userObj = { id: session.user.id, email: session.user.email };
        const { profile, role, assignedProjects } = await fetchProfileAndRole(userObj.id, userObj.email || '');

        if (mounted) {
          setSessionState({
            user: userObj,
            profile,
            role,
            assignedProjects,
            loading: false,
          });
          setupRealtime(userObj.id, userObj.email || '');
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
        if (mounted) {
          setSessionState({
            user: null,
            profile: null,
            role: null,
            assignedProjects: [],
            loading: false,
          });
        }
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT' || !session?.user) {
        if (realtimeChannel) {
          supabase.removeChannel(realtimeChannel);
          realtimeChannel = null;
        }
        setSessionState({
          user: null,
          profile: null,
          role: null,
          assignedProjects: [],
          loading: false,
        });
        return;
      }

      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        const userObj = { id: session.user.id, email: session.user.email };
        setSessionState((prev) => ({
          ...prev,
          user: userObj,
          loading: false,
        }));

        fetchProfileAndRole(userObj.id, userObj.email || '').then(({ profile, role, assignedProjects }) => {
          if (mounted) {
            setSessionState((prev) => ({
              ...prev,
              profile,
              role,
              assignedProjects,
            }));
            setupRealtime(userObj.id, userObj.email || '');
          }
        });
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
      }
    };
  }, []);

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data.user) {
      const userObj = { id: data.user.id, email: data.user.email };
      setSessionState({
        user: userObj,
        profile: null,
        role: null,
        assignedProjects: [],
        loading: false,
      });
      fetchProfileAndRole(userObj.id, userObj.email || '').then(({ profile, role, assignedProjects }) => {
        setSessionState((prev) => ({
          ...prev,
          profile,
          role,
          assignedProjects,
        }));
      });
    }
    return { error };
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    setSessionState({
      user: null,
      profile: null,
      role: null,
      assignedProjects: [],
      loading: false,
    });
    return { error };
  };

  return (
    <AuthContext.Provider value={{ ...sessionState, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
