import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import json5 from 'json5';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.join(__dirname, '..', 'src', 'contexts', 'source');
const BUILD_DIR = path.join(__dirname, '..', 'src', 'contexts', 'build');

// Create build directory if it doesn't exist
fs.mkdirSync(BUILD_DIR, { recursive: true });

// Transform @ prefixes to $ prefixes in an object
function transformPrefixes(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) return obj;

  const result: Record<string, unknown> = Array.isArray(obj) ? [] : {};

  for (const [key, value] of Object.entries(obj)) {
    const newKey = key.startsWith('@') ? `$${key.slice(1)}` : key;
    result[newKey] = transformPrefixes(value);
  }

  return result;
}

try {
  // Process each JSON-LD file
  const files = fs.readdirSync(SOURCE_DIR)
    .filter(file => file.endsWith('.jsonld'));

  for (const file of files) {
    try {
      const sourcePath = path.join(SOURCE_DIR, file);
      const content = fs.readFileSync(sourcePath, 'utf8');
      const json = JSON.parse(content);
      const transformed = transformPrefixes(json);

      // Create TypeScript constant
      const constName = path.basename(file, '.jsonld')
        .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

      const outputPath = path.join(BUILD_DIR, `${constName}.ts`);
      const outputContent = `// Generated from ${file}\nexport const ${constName} = ${json5.stringify(transformed, null, 2)} as const;\n`;

      fs.writeFileSync(outputPath, outputContent);
      console.log(`Processed ${file} -> ${path.basename(outputPath)}`);
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  }

  // Create index.ts to export all contexts
  const exportStatements = files
    .map(file => {
      const constName = path.basename(file, '.jsonld')
        .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      return `export { ${constName} } from './${constName}';`;
    })
    .join('\n');

  fs.writeFileSync(
    path.join(BUILD_DIR, 'index.ts'),
    `${exportStatements}\n`
  );

  console.log('Context build complete!');
} catch (error) {
  console.error('Build process failed:', error);
  process.exit(1);
}
