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
    'id', 'cp_code', 'partner_code', 'partner_name', 'company_name',
    'phone', 'mobile', 'alternate_phone', 'alternate_mobile', 'email',
    'address', 'city', 'state', 'pincode', 'rera_number',
    'valid_from', 'valid_to', 'rera_valid_from', 'rera_valid_to',
    'status', 'commission_type', 'commission_value',
    'default_commission_rate', 'default_commission_amount', 'notes',
    'created_at', 'updated_at'
  ];
  for (const col of cols) {
    await testColumn(col);
  }
}

probe();
