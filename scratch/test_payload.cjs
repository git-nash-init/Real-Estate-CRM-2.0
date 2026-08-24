const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://umuctbiofbyjwnqavxus.supabase.co';
const supabaseKey = 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY';
const supabase = createClient(supabaseUrl, supabaseKey);

async function start() {
  console.log('Testing channel_partners insert payload...');
  const payload = {
    partner_type: 'CHANNEL PARTNER',
    name: 'Test Partner Name',
    partner_name: 'Test Partner Name',
    company_name: 'Test Company',
    contact_person: 'Test Contact',
    mobile: '9000000000',
    phone: '9000000000',
    email: 'test@example.com',
    address: 'Test Address',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
    rera_registration_number: 'RERA-12345',
    rera_number: 'RERA-12345',
    valid_from: '2026-01-01',
    valid_to: '2030-12-31',
    rera_valid_from: '2026-01-01',
    rera_valid_to: '2030-12-31',
    pan_number: 'ABCDE1234F',
    gst_number: '27ABCDE1234F1Z5',
    bank_name: 'HDFC Bank',
    bank_account_name: 'Test Account',
    bank_account_number: '1234567890',
    bank_ifsc: 'HDFC0000123',
    branch_name: 'Mumbai Branch',
    commission_type: 'PERCENTAGE',
    commission_value: 2,
    commission_basis: 'CONSIDERATION_AMOUNT',
    default_commission_rate: 2,
    default_commission_amount: 0,
    status: 'ACTIVE',
    notes: 'Test Notes'
  };

  try {
    const { data, error } = await supabase.from('channel_partners').insert([payload]).select();
    if (error) {
      console.error('❌ Insert failed!');
      console.error('Code:', error.code);
      console.error('Message:', error.message);
      console.error('Details:', error.details);
      console.error('Hint:', error.hint);
    } else {
      console.log('✅ Insert Succeeded! Returned:', data);
      // Let's clean up
      if (data && data[0]) {
        const { error: delErr } = await supabase.from('channel_partners').delete().eq('id', data[0].id);
        if (delErr) {
          console.error('Cleanup failed:', delErr);
        } else {
          console.log('🧹 Cleaned up test record.');
        }
      }
    }
  } catch (err) {
    console.error('Exception:', err);
  }
}

start();
