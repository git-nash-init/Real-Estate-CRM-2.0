const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');

const candidates = [
  'id', 'lead_id', 'project_id', 'scheduled_at', 'status', 'remarks', 
  'channel_partner_id', 'created_at', 'updated_at', 'created_by', 
  'feedback', 'visit_date'
];

async function start() {
  const existing = [];
  const missing = [];
  for (const col of candidates) {
    const { error } = await s.from('site_visits').select(col).limit(1);
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
