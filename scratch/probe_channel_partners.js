const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://umuctbiofbyjwnqavxus.supabase.co';
const supabaseKey = 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY';
const supabase = createClient(supabaseUrl, supabaseKey);

async function probe() {
  console.log('Probing channel_partners table details...');
  try {
    const { data, error } = await supabase
      .from('channel_partners')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('Error selecting from channel_partners:', error.message);
    } else {
      console.log('Successfully queried channel_partners!');
      console.log('Sample record keys:', data.length > 0 ? Object.keys(data[0]) : 'No records found (table is empty)');
    }
  } catch (err) {
    console.error('Exception during query:', err.message);
  }
}

probe();
