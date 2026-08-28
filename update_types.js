import fs from 'fs';

try {
  const data = fs.readFileSync('C:/Users/dell/.gemini/antigravity-ide/brain/de2ce5fe-c029-4a79-9220-b95f1aae4da5/.system_generated/steps/74/output.txt', 'utf8');
  const json = JSON.parse(data);
  fs.writeFileSync('src/types/database.ts', json.types);
  console.log('Successfully updated database.ts');
} catch (e) {
  console.error(e);
}
