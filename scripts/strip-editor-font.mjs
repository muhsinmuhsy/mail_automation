import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const cssPath = join(process.cwd(), 'node_modules', '@templatical', 'editor', 'dist', 'style.css');

if (!existsSync(cssPath)) {
  console.log('[strip-editor-font] editor CSS not found, skipping.');
  process.exit(0);
}

const original = readFileSync(cssPath, 'utf-8');
const stripped = original.replace(/@import\s*["']https:\/\/fonts\.bunny\.net[^"']*["'];?/g, '');

if (original === stripped) {
  console.log('[strip-editor-font] no @import found, already clean.');
} else {
  writeFileSync(cssPath, stripped, 'utf-8');
  console.log('[strip-editor-font] stripped @import from editor CSS.');
}
