const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');

s.from('site_visits').select('*').limit(1).then(r => {
  console.log('site_visits columns:', r.data ? Object.keys(r.data[0] || {}) : 'no data', 'error:', r.error);
});
