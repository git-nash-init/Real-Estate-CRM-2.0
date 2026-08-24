const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://umuctbiofbyjwnqavxus.supabase.co';
const supabaseKey = 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY';
const supabase = createClient(supabaseUrl, supabaseKey);

async function runQuery(name, queryPromise) {
  console.log(`Running query: ${name}...`);
  try {
    const { data, error } = await queryPromise;
    if (error) {
      console.error(`❌ QUERY ${name} FAILED!`);
      console.error(`Code:    ${error.code}`);
      console.error(`Message: ${error.message}`);
      console.error(`Details: ${error.details}`);
      console.error(`Hint:    ${error.hint}`);
    } else {
      console.log(`✅ QUERY ${name} PASSED! (${data.length} records returned)`);
    }
  } catch (err) {
    console.error(`💥 EXCEPTION running query ${name}:`, err);
  }
  console.log('-------------------------------------------');
}

async function start() {
  await runQuery('channel_partners.select(*)', supabase.from('channel_partners').select('*'));
  await runQuery('leads.select(id, channel_partner_id)', supabase.from('leads').select('id, channel_partner_id'));
  await runQuery('bookings.select(id, channel_partner_id, booking_amount, total_payable_amount, status)', supabase.from('bookings').select('id, channel_partner_id, booking_amount, total_payable_amount, status'));
  await runQuery('channel_partner_commissions.select(*)', supabase.from('channel_partner_commissions').select('*'));
  await runQuery('projects.select(id, project_name)', supabase.from('projects').select('id, project_name').eq('status', 'active'));
  await runQuery('channel_partner_projects.select(*)', supabase.from('channel_partner_projects').select('*'));
}

start();
