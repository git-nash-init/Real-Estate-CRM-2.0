const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');

const email = 'test_user_antigravity_' + Math.floor(Math.random() * 100000) + '@gmail.com';
const password = 'TestPassword123!';

async function start() {
  const { data, error } = await s.auth.signUp({ email, password });
  if (error) {
    console.error('Sign up error:', error);
    return;
  }
  const userId = data.user.id;
  console.log('Authenticated as user:', userId);

  const randomUuid = '12345678-1234-1234-1234-1234567890ab';
  const r1 = await s.from('user_profiles').insert([{
    id: randomUuid,
    full_name: 'Random User Test',
    email: 'random@example.com'
  }]);
  console.log('Random UUID insert:', r1.error ? r1.error.code + ': ' + r1.error.message : 'SUCCESS');

  const r2 = await s.from('user_profiles').insert([{
    id: userId,
    full_name: 'Valid User Test',
    email: email
  }]);
  console.log('Valid UUID insert:', r2.error ? r2.error.code + ': ' + r2.error.message : 'SUCCESS');
}
start();
