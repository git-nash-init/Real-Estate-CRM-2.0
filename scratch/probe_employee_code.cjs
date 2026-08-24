const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');

s.from('employees').select('employee_code').limit(1).then(r => {
  console.log('employee_code column check error:', r.error ? r.error.message : 'No error (exists!)');
});
