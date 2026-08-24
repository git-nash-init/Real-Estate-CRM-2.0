const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');

async function probeCatalogs() {
  const { data, error } = await s.from('pg_enum').select('*');
  console.log('pg_enum:', { data, error });
}
probeCatalogs();
