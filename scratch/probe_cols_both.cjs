const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');

async function test() {
  const r1 = await s.from('employees').select('employee_id').limit(1);
  const r2 = await s.from('employees').select('employee_code').limit(1);
  console.log('employee_id:', r1.error ? 'no' : 'yes');
  console.log('employee_code:', r2.error ? 'no' : 'yes');
}
test();
