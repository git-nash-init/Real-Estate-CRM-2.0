import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import type { UserProfile, UserRole, UserSession } from '../types/auth';

interface AuthContextType extends UserSession {
  login: (email: string, password: string) => Promise<{ error: any }>;
  logout: () => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sessionState, setSessionState] = useState<UserSession>({
    user: null,
    profile: null,
    role: null,
    loading: true,
  });

  const fetchProfileAndRole = async (userId: string, email: string) => {
    try {
      // 1. Fetch user profile from user_profiles
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
        console.error('Error fetching user profile:', profileError.message);
      }

      // 2. Fetch role_id from user_roles
      const { data: userRole, error: userRoleError } = await supabase
        .from('user_roles')
        .select('role_id')
        .eq('user_id', userId)
        .maybeSingle();

      let roleName: UserRole | null = null;

      if (userRoleError) {
        console.error('Error fetching user role mapping:', userRoleError.message);
      } else if (userRole?.role_id) {
        // 3. Fetch role name from roles
        const { data: role, error: roleError } = await supabase
          .from('roles')
          .select('name')
          .eq('id', userRole.role_id)
          .maybeSingle();

        if (roleError) {
          console.error('Error fetching role name:', roleError.message);
        } else if (role?.name) {
          roleName = role.name as UserRole;
        }
      }

      // Fallback rule for Super Admin UUID:
      // "CURRENT SUPER ADMIN AUTH USER: 53812816-2e5f-4909-8163-2261cb2013bd"
      let finalRole = roleName;
      if (userId === '53812816-2e5f-4909-8163-2261cb2013bd' && !finalRole) {
        finalRole = 'super_admin';
      }

      const finalProfile: UserProfile = profile || {
        id: userId,
        email: email,
        full_name: profile?.full_name || (userId === '53812816-2e5f-4909-8163-2261cb2013bd' ? 'Super Admin' : null),
        avatar_url: profile?.avatar_url || null,
        status: profile?.status || 'active',
        created_at: profile?.created_at || new Date().toISOString(),
        updated_at: profile?.updated_at || new Date().toISOString(),
      };

      return {
        profile: finalProfile,
        role: finalRole,
      };
    } catch (err) {
      console.error('Unexpected error in fetchProfileAndRole:', err);
      return { profile: null, role: null };
    }
  };

  useEffect(() => {
    let mounted = true;

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      
      if (session?.user) {
        const { profile, role } = await fetchProfileAndRole(session.user.id, session.user.email || '');
        if (mounted) {
          setSessionState({
            user: { id: session.user.id, email: session.user.email },
            profile,
            role,
            loading: false,
          });
        }
      } else {
        if (mounted) {
          setSessionState({
            user: null,
            profile: null,
            role: null,
            loading: false,
          });
        }
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;

      if (session?.user) {
        setSessionState(prev => ({ ...prev, loading: true }));
        const { profile, role } = await fetchProfileAndRole(session.user.id, session.user.email || '');
        if (mounted) {
          setSessionState({
            user: { id: session.user.id, email: session.user.email },
            profile,
            role,
            loading: false,
          });
        }
      } else {
        if (mounted) {
          setSessionState({
            user: null,
            profile: null,
            role: null,
            loading: false,
          });
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
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
