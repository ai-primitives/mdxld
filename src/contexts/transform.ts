import { promises as fs } from 'fs'
import { join } from 'path'
import { JsonLdDocument, ContextDefinition } from 'jsonld'
import * as jsonld from 'jsonld'
import JSON5 from 'json5'
import { fileURLToPath } from 'url'

interface JsonLdContextDocument {
  '@context': ContextDefinition
}

function convertAtToDollar(obj: any): any {
  if (typeof obj !== 'object' || obj === null) return obj

  if (Array.isArray(obj)) {
    return obj.map(convertAtToDollar)
  }

  const result: any = {}
  for (const [key, value] of Object.entries(obj)) {
    const newKey = key.startsWith('@') ? `$${key.slice(1)}` : key
    result[newKey] = convertAtToDollar(value)
  }
  return result
}

async function transformContext(input: JsonLdContextDocument): Promise<string> {
  // Compact the context using JSON-LD API
  const context = input['@context']
  const compacted = await jsonld.compact({}, context)

  // Convert @ prefixes to $ prefixes
  const converted = convertAtToDollar(compacted)

  // Convert to JSON5 string (more compact than JSON)
  return JSON5.stringify(converted, null, 2)
}

async function processContextFile(filename: string, outputPath: string): Promise<void> {
  const content = await fs.readFile(filename, 'utf-8')
  const jsonldContent = JSON.parse(content) as JsonLdContextDocument
  const transformed = await transformContext(jsonldContent)

  // Export as a TypeScript constant
  const output = `const context = ${transformed} as const;
export default context;`

  await fs.writeFile(outputPath, output)
}

// Main build function
export async function buildContexts(): Promise<void> {
  const __dirname = fileURLToPath(new URL('.', import.meta.url))
  const sourceDir = join(__dirname, 'source')
  const buildDir = join(__dirname, 'build')

  // Ensure build directory exists
  await fs.mkdir(buildDir, { recursive: true })

  // Transform each context file
  const files = await fs.readdir(sourceDir)
  const contextFiles = files.filter(f => f.endsWith('.jsonld'))

  await Promise.all(
    contextFiles.map(async file => {
      const inputPath = join(sourceDir, file)
      const outputName = file.replace('.jsonld', '.ts')
      const outputPath = join(buildDir, outputName)
      await processContextFile(inputPath, outputPath)
    })
  )

  // Update index.ts with exports
  const indexPath = join(__dirname, 'index.ts')
  const exports = contextFiles
    .map(file => {
      const name = file.replace('.jsonld', '')
      const camelName = name.replace(/-./g, x => x[1].toUpperCase())
      return `export { default as ${camelName}Context } from './build/${name}'`
    })
    .join('\n')

  const indexContent = `/**
 * JSON-LD Context Exports
 * Auto-generated exports will be added here after build
 */

// Export types for external use
export type { JsonLdDocument, ContextDefinition } from 'jsonld'

// Context exports
${exports}
`

  await fs.writeFile(indexPath, indexContent)
}

// Run build if called directly
if (import.meta.url === fileURLToPath(new URL(process.argv[1], 'file:'))) {
  buildContexts().catch(console.error)
}
