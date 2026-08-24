const https = require('https');
const apiKey = 'sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY';
https.get({
  hostname: 'umuctbiofbyjwnqavxus.supabase.co',
  path: '/rest/v1/',
  headers: {
    'apikey': apiKey,
    'Authorization': 'Bearer ' + apiKey
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log(body);
  });
});
