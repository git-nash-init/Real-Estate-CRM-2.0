import { supabase } from './src/services/supabaseClient.js';
async function test() {
  const { data: roles, error: e1 } = await supabase.from('roles').select('id, name');
  console.log('Roles:', roles, 'Error:', e1);
  const tcRoleId = roles?.find(r => r.name === 'telecaller')?.id;
  console.log('tcRoleId:', tcRoleId);
  if (tcRoleId) {
    const { data: userRoles, error: e2 } = await supabase.from('user_roles').select('user_id').eq('role_id', tcRoleId);
    console.log('UserRoles:', userRoles, 'Error:', e2);
    if (userRoles) {
      const userIds = userRoles.map(ur => ur.user_id);
      const { data: profiles, error: e3 } = await supabase.from('user_profiles').select('id, full_name').in('id', userIds);
      console.log('Profiles:', profiles, 'Error:', e3);
    }
  }
}
test();
