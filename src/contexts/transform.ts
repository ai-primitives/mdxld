import { promises as fs } from 'fs'
import { join } from 'path'
import { JsonLdDocument, ContextDefinition } from 'jsonld'
import * as jsonld from 'jsonld'
import JSON5 from 'json5'

interface JsonLdContextDocument {
  '@context': ContextDefinition
}

async function transformContext(input: JsonLdContextDocument): Promise<string> {
  // Compact the context using JSON-LD API
  const context = input['@context']
  const compacted = await jsonld.compact({}, context)

  // Convert to JSON5 string (more compact than JSON)
  return JSON5.stringify(compacted, null, 2)
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
}

// Run build if called directly
if (require.main === module) {
  buildContexts().catch(console.error)
}
