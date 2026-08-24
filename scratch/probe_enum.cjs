const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');
s.from('cp_commissions').insert([{
  cp_id: '53812816-2e5f-4909-8163-2261cb2013bd',
  booking_id: '53812816-2e5f-4909-8163-2261cb2013bd',
  commission_percentage: 1,
  commission_amount: 100,
  payable_amount: 100,
  status: 'INVALID_STATUS_TEST'
}]).then(r => console.log(JSON.stringify(r)));
