const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');

async function start() {
  const { data: rData, error: rErr } = await s.from('roles').select('*').limit(1);
  console.log('roles columns:', rData && rData.length > 0 ? Object.keys(rData[0]) : 'empty', 'err:', rErr);
  const { data: urData, error: urErr } = await s.from('user_roles').select('*').limit(1);
  console.log('user_roles columns:', urData && urData.length > 0 ? Object.keys(urData[0]) : 'empty', 'err:', urErr);
}
start();
