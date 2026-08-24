const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');

const roles = [
  'super_admin', 'project_admin', 'site_head', 'sourcing_manager_tl', 'sourcing_manager',
  'telecaller', 'presales_tl', 'presales', 'closing_manager_tl', 'closing_manager',
  'marketing_head', 'marketing', 'receptionist', 'channel_partner',
];

const PASSWORD = 'CrmTest@2026';
const results = [];

(async () => {
  for (const role of roles) {
    const email = `test.${role}@gmail.com`;
    const { data, error } = await s.auth.signUp({ email, password: PASSWORD });
    if (error) {
      results.push({ role, email, error: error.message });
    } else {
      results.push({ role, email, user_id: data.user?.id });
    }
    // small delay to be polite to the auth rate limiter
    await new Promise(r => setTimeout(r, 400));
  }
  console.log(JSON.stringify(results, null, 2));
})();
