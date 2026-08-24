const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://umuctbiofbyjwnqavxus.supabase.co', 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY');

const email = 'test_user_antigravity_' + Math.floor(Math.random() * 100000) + '@gmail.com';
const password = 'TestPassword123!';

s.auth.signUp({ email, password }).then(r => {
  console.log('signUp result:', r.data.user ? 'User created: ' + r.data.user.id : 'No user', r.error || 'No error');
});
