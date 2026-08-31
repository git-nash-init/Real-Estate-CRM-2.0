export type UserRole =
  | 'super_admin'
  | 'project_admin'
  | 'site_head'
  | 'sourcing_manager_tl'
  | 'sourcing_manager'
  | 'presales_tl'
  | 'presales'
  | 'closing_manager_tl'
  | 'closing_manager'
  | 'marketing_head'
  | 'marketing'
  | 'receptionist'
  | 'channel_partner';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
  must_change_password?: boolean;
}

export interface UserSession {
  user: {
    id: string;
    email?: string;
  } | null;
  profile: UserProfile | null;
  role: UserRole | null;
  assignedProjects: string[];
  loading: boolean;
}
