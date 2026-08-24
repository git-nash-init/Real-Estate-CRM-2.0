const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');

const tables = [
  'employees', 'departments', 'designations', 'user_profiles', 'user_roles', 'roles'
];

async function start() {
  for (const table of tables) {
    const { status, error } = await s.from(table).select('*').limit(1);
    if (error && error.message.includes('Could not find the table')) {
      console.log('Table ' + table + ' does NOT exist.');
    } else if (error) {
      console.log('Table ' + table + ' exists but returned error: ' + error.message + ' (status: ' + status + ')');
    } else {
      console.log('Table ' + table + ' exists!');
    }
  }
}
start();
