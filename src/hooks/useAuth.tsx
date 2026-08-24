import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import type { UserProfile, UserRole, UserSession } from '../types/auth';

interface AuthContextType extends UserSession {
  login: (email: string, password: string) => Promise<{ error: any }>;
  logout: () => Promise<{ error: any }>;
}

interface AuthUser {
  id: string;
  email?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
    console.error('Unexpected error in fetchProfileAndRole:', err);
    return { profile: null, role: null };
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Split in two: `authUser` tracks only what Supabase's auth events tell us
  // (id/email), `sessionState` carries the derived profile/role once fetched.
  // This split is deliberate — see the effect below for why.
  const [authUser, setAuthUser] = useState<AuthUser | null | undefined>(undefined); // undefined = not yet resolved
  const [sessionState, setSessionState] = useState<UserSession>({
    user: null,
    profile: null,
    role: null,
    loading: true,
  });

  // Auth-event listener: intentionally does NOTHING but synchronous state
  // updates. supabase-js holds a navigator.locks lock for the entire
  // duration of this callback; if it were async and awaited another
  // Supabase call (as this used to), that call's own internal getSession()
  // would deadlock waiting on the same lock this callback is holding —
  // the callback would never resolve, and `loading` would stay true
  // forever. Since onAuthStateChange fires an INITIAL_SESSION event on
  // every page load, that deadlock reproduced on every load, not just
  // some — this is what caused the permanent "Verifying secure session..."
  // hang. A single getSession() call up front is redundant with
  // INITIAL_SESSION, so it's dropped rather than kept as a second source
  // of truth.
  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setAuthUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Profile/role fetch lives in its own effect, entirely outside the auth
  // callback above, so it's free to await Supabase calls without deadlocking.
  useEffect(() => {
    if (authUser === undefined) return; // still waiting on the first auth event

    let cancelled = false;

    if (!authUser) {
      setSessionState({ user: null, profile: null, role: null, loading: false });
      return;
    }

    setSessionState((prev) => ({ ...prev, user: authUser, loading: true }));

    fetchProfileAndRole(authUser.id, authUser.email || '')
      .then(({ profile, role }) => {
        if (!cancelled) setSessionState({ user: authUser, profile, role, loading: false });
      })
      .catch((err) => {
        // fetchProfileAndRole already catches internally and never throws,
        // but this guards against a truly unexpected failure so `loading`
        // can never be stranded at true.
        console.error('Unexpected error resolving profile/role:', err);
        if (!cancelled) setSessionState({ user: authUser, profile: null, role: null, loading: false });
      });

    return () => {
      cancelled = true;
    };
  }, [authUser]);

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
