const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');

const candidates = [
  'id', 'lead_id', 'status', 'notes', 'due_at', 'reminder_at', 'created_at', 'updated_at', 'created_by'
];

async function start() {
  const existing = [];
  const missing = [];
  
  // Try querying table first
  const { data, error: tableError } = await s.from('followups').select('*').limit(1);
  if (tableError) {
    console.log('❌ Error selecting from table:', tableError.message);
  } else {
    console.log('✅ Connected to followups table!');
  }

  for (const col of candidates) {
    const { error } = await s.from('followups').select(col).limit(1);
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
