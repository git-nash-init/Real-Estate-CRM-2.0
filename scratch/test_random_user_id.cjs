const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');

s.from('employees').insert([{
  id: '53812816-2e5f-4909-8163-2261cb2013bd',
  first_name: 'Anil',
  mobile: '7039122395',
  employee_id: 'EMP-999',
  joining_date: '2026-08-22',
  department: 'Sales',
  designation: 'Sourcing Manager',
  user_id: '12345678-1234-1234-1234-1234567890ab'
}]).then(r => {
  console.log('insert result:', r.error || 'SUCCESS');
});
