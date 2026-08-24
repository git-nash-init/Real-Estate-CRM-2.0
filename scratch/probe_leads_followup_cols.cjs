const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');

const candidates = [
  'next_followup_at', 'last_contact_at', 'next_followup_date', 'last_contact_date'
];

async function start() {
  const existing = [];
  const missing = [];
  for (const col of candidates) {
    const { error } = await s.from('leads').select(col).limit(1);
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
