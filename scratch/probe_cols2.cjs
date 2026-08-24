const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://umuctbiofbyjwnqavxus.supabase.co';
const supabaseKey = 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testColumn(col) {
  const { error } = await supabase.from('channel_partners').select(col).limit(1);
  if (error) {
    console.log(`Column ${col}: FAIL (${error.message})`);
  } else {
    console.log(`Column ${col}: PASS`);
  }
}

async function probe() {
  const cols = [
    'name', 'contact_person', 'company', 'commission_rate', 'fixed_commission', 'commission_basis'
  ];
  for (const col of cols) {
    await testColumn(col);
  }
}

probe();
