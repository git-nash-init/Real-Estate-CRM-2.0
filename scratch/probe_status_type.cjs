const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');

s.from('employees').insert([{ id: '53812816-2e5f-4909-8163-2261cb2013bd', employment_status: 'RANDOM_STATUS_VAL' }]).then(r => {
  console.log('insert result:', r.error);
});
