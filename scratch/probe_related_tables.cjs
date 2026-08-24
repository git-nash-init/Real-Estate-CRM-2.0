const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');

const tables = ['site_visits', 'bookings', 'tasks', 'attendance'];

async function start() {
  for (const t of tables) {
    const { data, error } = await s.from(t).select('*').limit(1);
    if (error) {
      console.log('Table ' + t + ' error: ' + error.message);
    } else {
      console.log('Table ' + t + ' columns: ' + (data && data.length > 0 ? Object.keys(data[0]).join(', ') : 'empty table'));
    }
  }
}
start();
