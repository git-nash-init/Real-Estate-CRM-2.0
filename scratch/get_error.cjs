const https = require('https');
const url = 'https://umuctbiofbyjwnqavxus.supabase.co/rest/v1/?apikey=sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY';

https.get(url, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log(body);
  });
});
