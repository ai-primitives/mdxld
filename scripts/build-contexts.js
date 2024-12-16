const fs = require('fs');
const path = require('path');
const json5 = require('json5');

const SOURCE_DIR = path.join(__dirname, '..', 'src', 'contexts', 'source');
const BUILD_DIR = path.join(__dirname, '..', 'src', 'contexts', 'build');

// Ensure build directory exists
if (!fs.existsSync(BUILD_DIR)) {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
}

// Transform @ prefixes to $ prefixes in an object
function transformPrefixes(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;

  const result = Array.isArray(obj) ? [] : {};

  for (const [key, value] of Object.entries(obj)) {
    const newKey = key.startsWith('@') ? `$${key.slice(1)}` : key;
    result[newKey] = transformPrefixes(value);
  }

  return result;
}

// Process each JSON-LD file
fs.readdirSync(SOURCE_DIR)
  .filter(file => file.endsWith('.jsonld'))
  .forEach(file => {
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
  });

// Create index.ts to export all contexts
const exportStatements = fs.readdirSync(SOURCE_DIR)
  .filter(file => file.endsWith('.jsonld'))
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
