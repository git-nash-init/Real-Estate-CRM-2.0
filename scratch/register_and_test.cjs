const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');

const email = 'temp_test_user_' + Math.random().toString(36).substring(7) + '@example.com';
const password = 'TestPassword123!';

async function start() {
  console.log('Signing up temporary user:', email);
  const { data: signUpData, error: signUpError } = await s.auth.signUp({ email, password });
  if (signUpError) {
    console.error('Sign up failed:', signUpError.message);
    return;
  }

  const userId = signUpData.user.id;
  console.log('Sign up successful! User UUID:', userId);

  // Now try to insert into user_profiles with a random UUID (which does NOT exist in auth.users)
  const randomUuid = '12345678-1234-1234-1234-1234567890ab';
  console.log('Testing insert of random UUID into user_profiles...');
  const r1 = await s.from('user_profiles').insert([{
    id: randomUuid,
    full_name: 'Random User Test',
    email: 'random@example.com'
  }]);
  console.log('Random UUID insert result:', r1.error ? r1.error.code + ': ' + r1.error.message : 'SUCCESS');

  // Now try to insert into user_profiles with the valid user UUID
  console.log('Testing insert of valid user UUID into user_profiles...');
  const r2 = await s.from('user_profiles').insert([{
    id: userId,
    full_name: 'Valid User Test',
    email: email
  }]);
  console.log('Valid UUID insert result:', r2.error ? r2.error.code + ': ' + r2.error.message : 'SUCCESS');
}
start();
