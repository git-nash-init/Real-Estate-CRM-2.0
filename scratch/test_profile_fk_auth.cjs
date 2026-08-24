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

  // Try to insert a random UUID
  const randomUuid = '12345678-1234-1234-1234-1234567890ab';
  console.log('Inserting random UUID...');
  const r1 = await s.from('user_profiles').insert([{
    id: randomUuid,
    full_name: 'Random User Test',
    email: 'random@example.com'
  }]);
  
  if (r1.error) {
    console.log('Random UUID error code:', r1.error.code);
    console.log('Random UUID error message:', r1.error.message);
  } else {
    console.log('Random UUID insert: SUCCESS');
  }

  // Try to insert valid UUID
  console.log('Inserting valid UUID...');
  const r2 = await s.from('user_profiles').insert([{
    id: userId,
    full_name: 'Valid User Test',
    email: email
  }]);
  if (r2.error) {
    console.log('Valid UUID error code:', r2.error.code);
    console.log('Valid UUID error message:', r2.error.message);
  } else {
    console.log('Valid UUID insert: SUCCESS');
  }
}
start();
