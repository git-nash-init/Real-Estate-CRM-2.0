const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');

s.from('leads').select('*').limit(1).then(r => {
  console.log('leads columns:', r.data && r.data.length > 0 ? Object.keys(r.data[0]) : 'no data', 'error:', r.error);
});
