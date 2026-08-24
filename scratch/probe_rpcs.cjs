const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');

const rpcs = ['exec_sql', 'execute_sql', 'run_sql', 'query', 'sql', 'exec', 'run_query'];

async function start() {
  for (const r of rpcs) {
    const { data, error } = await s.rpc(r, { query: 'select 1', sql: 'select 1' });
    if (error && error.message.includes('Could not find the function')) {
      console.log('RPC ' + r + ' does NOT exist.');
    } else {
      console.log('RPC ' + r + ' response:', data, error);
    }
  }
}
start();
