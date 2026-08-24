const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');

async function testRpc() {
  const { data, error } = await s.rpc('exec_sql', { sql: 'SELECT * FROM pg_policies' });
  console.log('exec_sql RPC result:', { data, error });
}
testRpc();
