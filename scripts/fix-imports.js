/**
 * Post-build script to replace zod3/zod4 imports with zod in dist files.
 *
 * During development, we use zod3 and zod4 aliases to get proper type definitions
 * for each Zod version. At runtime, consumers provide their own zod package,
 * so we need to rewrite the imports.
 */

const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');

const files = [
  'zod-fast-check.js',
  'zod-fast-check.d.ts',
  'zod4-fast-check.js',
  'zod4-fast-check.d.ts',
];

for (const file of files) {
  const filePath = path.join(distDir, file);

  if (!fs.existsSync(filePath)) {
    console.warn(`Warning: ${file} not found, skipping`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf8');

  // Replace zod3 and zod4 imports with zod
  content = content.replace(/from ["']zod3["']/g, 'from "zod"');
  content = content.replace(/from ["']zod4["']/g, 'from "zod"');
  content = content.replace(/require\(["']zod3["']\)/g, 'require("zod")');
  content = content.replace(/require\(["']zod4["']\)/g, 'require("zod")');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Fixed imports in ${file}`);
}

console.log('Done!');
