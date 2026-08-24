const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');

const candidates = [
  'reject', 'declined', 'disapproved', 'void', 'draft', 'failed', 'active', 'inactive'
];

async function testAll() {
  for (const status of candidates) {
    const { error } = await s.from('cp_commissions').insert([{
      cp_id: '53812816-2e5f-4909-8163-2261cb2013bd',
      booking_id: '53812816-2e5f-4909-8163-2261cb2013bd',
      commission_percentage: 1.5,
      commission_amount: 150,
      payable_amount: 150,
      status: status
    }]);
    
    if (error && error.message.includes('invalid input value for enum commission_status')) {
      console.log('❌ Invalid:', status);
    } else if (error) {
      console.log('⚠️ Valid but failed other constraints:', status, ':', error.message);
    } else {
      console.log('✅ Valid and inserted successfully:', status);
    }
  }
}

testAll();
