const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');

const candidates = [
  'id', 'first_name', 'last_name', 'email', 'mobile', 'phone', 'department', 'designation', 'status', 'role',
  'joining_date', 'employment_status', 'reporting_manager', 'profile_photo', 'avatar', 'gender', 'dob',
  'date_of_birth', 'personal_email', 'official_email', 'work_location', 'branch', 'address', 'city', 'state',
  'pincode', 'emergency_contact_name', 'emergency_contact_phone', 'notes', 'user_id', 'created_at', 'updated_at'
];

async function start() {
  const existing = [];
  const missing = [];
  for (const col of candidates) {
    const { error } = await s.from('employees').select(col).limit(1);
    if (error) {
      missing.push(col);
    } else {
      existing.push(col);
    }
  }
  console.log('EXISTING:', existing.join(', '));
  console.log('MISSING:', missing.join(', '));
}
start();
