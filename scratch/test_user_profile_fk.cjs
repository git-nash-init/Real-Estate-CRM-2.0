const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');

s.from('user_profiles').insert([{
  id: '12345678-1234-1234-1234-1234567890ab',
  full_name: 'Anil Test',
  email: 'aniltest@example.com'
}]).then(r => {
  console.log('insert result:', r.error || 'SUCCESS');
});
