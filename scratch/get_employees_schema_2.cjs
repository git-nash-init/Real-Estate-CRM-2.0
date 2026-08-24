const https = require('https');
const url = 'https://umuctbiofbyjwnqavxus.supabase.co/rest/v1/?apikey=sb_publishable_IZAoq75Yde0sBwTeRo92pg_8wD26bmY';

https.get(url, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    try {
      const spec = JSON.parse(body);
      console.log('Root keys:', Object.keys(spec));
      if (spec.paths) {
        console.log('Paths:', Object.keys(spec.paths).filter(k => k.includes('employee')));
      }
      if (spec.definitions) {
        console.log('Definitions keys (sample):', Object.keys(spec.definitions).slice(0, 10));
      }
    } catch (e) {
      console.error('Error:', e);
    }
  });
});
