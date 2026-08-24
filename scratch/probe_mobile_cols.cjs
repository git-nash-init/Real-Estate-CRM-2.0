const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');

async function test() {
  const cols = ['official_mobile', 'mobile', 'alternate_mobile'];
  for (const c of cols) {
    const r = await s.from('employees').select(c).limit(1);
    console.log(c + ':', r.error ? 'no' : 'yes');
  }
}
test();
