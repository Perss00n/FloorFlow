import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

let checked = 0;
for (const directory of ['src', 'public/js', 'scripts', 'test']) {
  for (const entry of readdirSync(directory, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const file = join(entry.parentPath, entry.name);
    const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
    if (result.error || result.status !== 0) {
      console.error(`JavaScript syntax check failed: ${file}`);
      process.exit(1);
    }
    checked += 1;
  }
}
console.log(`Checked ${checked} JavaScript files.`);
