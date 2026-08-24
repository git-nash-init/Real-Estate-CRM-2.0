const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');

const candidates = [
  'active', 'inactive', 'on_leave', 'resigned', 'terminated',
  'ACTIVE', 'INACTIVE', 'ON_LEAVE', 'RESIGNED', 'TERMINATED'
];

async function start() {
  for (const status of candidates) {
    const { error } = await s.from('employees').insert([{
      id: '53812816-2e5f-4909-8163-2261cb2013bd',
      employment_status: status
    }]);
    if (error && error.message.includes('invalid input value for enum employment_status')) {
      console.log('❌ Invalid:', status);
    } else if (error) {
      console.log('⚠️ Valid but failed other constraints:', status, ':', error.message);
    } else {
      console.log('✅ Valid and inserted successfully:', status);
    }
  }
}
start();
