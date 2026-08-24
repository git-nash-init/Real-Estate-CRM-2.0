const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');

s.from('user_profiles').select('*').then(r => {
  console.log('user_profiles:', r.data ? r.data.length + ' records' : 'error', r.error || '');
  if (r.data && r.data.length > 0) {
    console.log('First profile:', r.data[0]);
  }
});
