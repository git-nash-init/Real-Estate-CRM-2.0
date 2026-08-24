const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');

const userId = '53812816-2e5f-4909-8163-2261cb2013bd';

async function start() {
  const r1 = await s.from('leads').select('id, customer_name, status, created_at').eq('owner_id', userId);
  console.log('leads query:', r1.error ? r1.error.message : r1.data.length + ' records');

  const r2 = await s.from('site_visits').select('id, scheduled_at, status, remarks, leads!inner(customer_name, owner_id)').eq('leads.owner_id', userId);
  console.log('site_visits query:', r2.error ? r2.error.message : r2.data.length + ' records');

  const r3 = await s.from('bookings').select('id, booking_amount, status, booking_date, leads!inner(customer_name, owner_id)').eq('leads.owner_id', userId);
  console.log('bookings query:', r3.error ? r3.error.message : r3.data.length + ' records');
}
start();
