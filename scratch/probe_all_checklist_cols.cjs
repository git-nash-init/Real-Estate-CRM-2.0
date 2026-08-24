const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');

const checklist = [
  'user_id', 'employee_code', 'first_name', 'last_name', 'designation', 'department',
  'joining_date', 'employment_status', 'reporting_manager', 'emergency_contact_name',
  'emergency_contact_mobile', 'work_location', 'official_email', 'official_mobile',
  'employee_id', 'profile_photo', 'gender', 'date_of_birth', 'mobile', 'alternate_mobile',
  'personal_email', 'employment_type', 'branch', 'address', 'city', 'state', 'pincode',
  'emergency_contact_phone', 'notes'
];

async function test() {
  const missing = [];
  for (const col of checklist) {
    const { error } = await s.from('employees').select(col).limit(1);
    if (error) {
      missing.push(col + ' (error: ' + error.message + ')');
    }
  }
  console.log('Missing columns from checklist:', missing.length > 0 ? missing.join(', ') : 'NONE! All exist!');
}
test();
