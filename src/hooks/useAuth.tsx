import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import type { UserProfile, UserRole, UserSession } from '../types/auth';

interface AuthContextType extends UserSession {
  login: (email: string, password: string) => Promise<{ error: any }>;
  logout: () => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const fetchProfileAndRole = async (userId: string, email: string): Promise<{ profile: UserProfile | null; role: UserRole | null }> => {
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

    // 2.5s safeguard timeout so database latency never hangs auth
    const timeoutPromise = new Promise<{ timeout: true }>((resolve) =>
      setTimeout(() => resolve({ timeout: true }), 2500)
    );

    const [profileRes, userRoleRes] = await Promise.race([
      Promise.all([profilePromise, userRolePromise]),
      timeoutPromise.then(() => [{ data: null, error: null }, { data: null, error: null }]),
    ]);

    const profile = (profileRes as any)?.data;
    const userRole = (userRoleRes as any)?.data;

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
          return { user: null, profile: null, role: null, loading: false };
        }
      }
    } catch {
      // ignore
    }
    return { user: null, profile: null, role: null, loading: true };
  });

  useEffect(() => {
    let mounted = true;

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
            loading: false,
          });
          return;
        }

        const userObj = { id: session.user.id, email: session.user.email };
        const { profile, role } = await fetchProfileAndRole(userObj.id, userObj.email || '');

        if (mounted) {
          setSessionState({
            user: userObj,
            profile,
            role,
            loading: false,
          });
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
        if (mounted) {
          setSessionState({
            user: null,
            profile: null,
            role: null,
            loading: false,
          });
        }
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT' || !session?.user) {
        setSessionState({
          user: null,
          profile: null,
          role: null,
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

        fetchProfileAndRole(userObj.id, userObj.email || '').then(({ profile, role }) => {
          if (mounted) {
            setSessionState((prev) => ({
              ...prev,
              profile,
              role,
            }));
          }
        });
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
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
        loading: false,
      });
      fetchProfileAndRole(userObj.id, userObj.email || '').then(({ profile, role }) => {
        setSessionState((prev) => ({
          ...prev,
          profile,
          role,
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

