const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://umuctbiofbyjwnqavxus.supabase.co';
const supabaseKey = 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY';
const supabase = createClient(supabaseUrl, supabaseKey);

const allPossibleColumns = [
  'partner_code',
  'name',
  'partner_name',
  'company_name',
  'contact_person',
  'mobile',
  'phone',
  'email',
  'address',
  'city',
  'state',
  'pincode',
  'rera_registration_number',
  'rera_number',
  'valid_from',
  'valid_to',
  'rera_valid_from',
  'rera_valid_to',
  'pan_number',
  'gst_number',
  'bank_name',
  'bank_account_name',
  'bank_account_number',
  'bank_ifsc',
  'branch_name',
  'commission_type',
  'commission_value',
  'commission_basis',
  'default_commission_rate',
  'default_commission_amount',
  'status',
  'notes'
];

async function start() {
  console.log('Testing column existence...');
  const workingColumns = [];
  
  for (const col of allPossibleColumns) {
    const payload = {};
    // Set a dummy value based on type assumption
    if (col.includes('valid') || col === 'valid_from' || col === 'valid_to') {
      payload[col] = '2026-01-01';
    } else if (col.includes('value') || col.includes('rate') || col.includes('amount')) {
      payload[col] = 1;
    } else {
      payload[col] = 'test';
    }

    try {
      // Try to insert a dummy record with just this one column (plus ID)
      const { error } = await supabase.from('channel_partners').insert([payload]);
      if (error && error.message.includes('schema cache')) {
        console.log(`❌ Column '${col}' does NOT exist.`);
      } else {
        console.log(`✅ Column '${col}' EXISTS.`);
        workingColumns.push(col);
      }
    } catch (err) {
      console.log(`💥 Exception testing '${col}':`, err);
    }
  }

  console.log('\nAll Working Columns in Supabase channel_partners table:', workingColumns);
}

start();
