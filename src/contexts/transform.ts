import { promises as fs } from 'fs'
import { join, dirname } from 'path'
import { JsonLdDocument, ContextDefinition } from 'jsonld'
import * as jsonld from 'jsonld'
import JSON5 from 'json5'
import { fileURLToPath } from 'url'

// Get directory path
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

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
  try {
    console.log('\nTransforming context...')
    let contextSize: number
    let contextObj: any

    // Extract context object, handling both direct and wrapped contexts
    try {
      contextObj = input['@context'] ? input['@context'] : input
      const contextStr = JSON.stringify(contextObj)
      contextSize = contextStr.length
      console.log(`Input context size: ${contextSize} bytes`)
      console.log('Context structure:', Object.keys(contextObj).join(', '))
    } catch (e) {
      console.error('Error processing context:', e)
      throw e
    }

    // Create a minimal document with the context
    const doc = {
      '@context': contextObj,
      '@type': 'http://schema.org/Thing'
    }

    console.log('\nCompacting document...')
    let compacted
    try {
      compacted = await jsonld.compact(doc, contextObj, {
        documentLoader: jsonld.documentLoaders.node(),
        skipExpansion: true,
        compactArrays: true
      })
      console.log('Compaction complete')
    } catch (e) {
      console.error('Error compacting document:', e)
      throw e
    }

    // Convert @ prefixes to $ prefixes
    console.log('\nConverting prefixes...')
    let converted
    try {
      converted = convertAtToDollar(compacted['@context'] || compacted)
      console.log('Prefix conversion complete')
    } catch (e) {
      console.error('Error converting prefixes:', e)
      throw e
    }

    // Convert to JSON5 string (more compact than JSON)
    console.log('\nGenerating JSON5...')
    let json5Output: string
    try {
      json5Output = JSON5.stringify(converted, null, 2)
      const outputSize = json5Output.length
      console.log(`Output size: ${outputSize} bytes (${Math.round((outputSize / contextSize) * 100)}% of original)`)
    } catch (e) {
      console.error('Error generating JSON5:', e)
      throw e
    }

    return json5Output
  } catch (error) {
    console.error('Error in transformContext:', error)
    throw error
  }
}

async function processContextFile(filename: string, outputPath: string): Promise<void> {
  try {
    console.log(`\nProcessing ${filename}...`)
    console.log('Reading file...')
    const content = await fs.readFile(filename, 'utf-8')
    console.log(`File content size: ${content.length} bytes`)

    console.log('Parsing JSON-LD...')
    let jsonldContent
    try {
      jsonldContent = JSON.parse(content)
      console.log('JSON structure:', Object.keys(jsonldContent))

      // Handle both direct context and wrapped context
      const contextDoc: JsonLdContextDocument = jsonldContent['@context']
        ? { '@context': jsonldContent['@context'] }
        : jsonldContent

      console.log('Context keys:', Object.keys(contextDoc['@context']))
    } catch (e) {
      console.error('Error parsing JSON-LD:', e)
      throw e
    }

    console.log('Starting transformation...')
    const transformed = await transformContext(jsonldContent)
    console.log('Transformation complete')

    // Export as a TypeScript constant
    const output = `// Auto-generated from ${filename}
const context = ${transformed} as const;
export default context;`

    console.log('Writing output...')
    await fs.writeFile(outputPath, output)
    console.log(`Generated ${outputPath}`)
  } catch (error) {
    console.error(`Error processing file ${filename}:`, error)
    throw error
  }
}

// Main build function
export async function buildContexts(): Promise<void> {
  try {
    const sourceDir = join(__dirname, 'source')
    const buildDir = join(__dirname, 'build')

    console.log('\nSource directory:', sourceDir)
    console.log('Build directory:', buildDir)

    // Ensure build directory exists
    await fs.mkdir(buildDir, { recursive: true })

    // Transform each context file
    const files = await fs.readdir(sourceDir)
    console.log('\nFound files:', files)

    // Filter out .gitkeep and only process .jsonld files
    const contextFiles = files.filter(f => f.endsWith('.jsonld') && !f.startsWith('.'))
    console.log('Context files to process:', contextFiles)

    if (contextFiles.length === 0) {
      throw new Error('No .jsonld files found in source directory')
    }

    // Process files sequentially for better logging
    for (const file of contextFiles) {
      const inputPath = join(sourceDir, file)
      const outputName = file.replace('.jsonld', '.ts')
      const outputPath = join(buildDir, outputName)
      await processContextFile(inputPath, outputPath)
    }

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
    console.log('\nUpdated index.ts')

    // Print file size comparison
    console.log('\nFile size comparison:')
    for (const file of contextFiles) {
      const inputPath = join(sourceDir, file)
      const outputPath = join(buildDir, file.replace('.jsonld', '.ts'))
      const inputStats = await fs.stat(inputPath)
      const outputStats = await fs.stat(outputPath)
      console.log(`\n${file}:`)
      console.log(`Original: ${(inputStats.size / 1024).toFixed(2)}KB`)
      console.log(`Transformed: ${(outputStats.size / 1024).toFixed(2)}KB`)
    }
  } catch (error) {
    console.error('\nBuild error:', error)
    process.exit(1)
  }
}

// Run build if called directly
if (import.meta.url === fileURLToPath(new URL(process.argv[1], 'file:'))) {
  buildContexts().catch(error => {
    console.error('\nFatal error:', error)
    process.exit(1)
  })
}
