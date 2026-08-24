const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');

async function test() {
  const r1 = await s.from('employees').select('emergency_contact_mobile').limit(1);
  const r2 = await s.from('employees').select('emergency_contact_phone').limit(1);
  console.log('emergency_contact_mobile:', r1.error ? 'no' : 'yes');
  console.log('emergency_contact_phone:', r2.error ? 'no' : 'yes');
}
test();
