const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://umuctbiofbyjwnqavxus.supabase.co';
const supabaseKey = 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY';
const supabase = createClient(supabaseUrl, supabaseKey);

async function start() {
  console.log('Fetching channel_partners schema details...');
  try {
    // Select one row or empty result to see columns returned
    const { data, error } = await supabase.from('channel_partners').select('*').limit(1);
    if (error) {
      console.error('❌ Failed to select from channel_partners:', error);
    } else {
      console.log('✅ Successfully connected to channel_partners table!');
      if (data && data.length > 0) {
        console.log('Columns in table:', Object.keys(data[0]));
      } else {
        console.log('Table is empty, but query returned successfully.');
      }
    }
  } catch (err) {
    console.error('Exception:', err);
  }
}

start();
