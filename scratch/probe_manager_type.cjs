const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');

s.from('employees').insert([{ id: '53812816-2e5f-4909-8163-2261cb2013bd', reporting_manager: 'EMP-001' }]).then(r => {
  console.log('insert result:', r.error);
});
