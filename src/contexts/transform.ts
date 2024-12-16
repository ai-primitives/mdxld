import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import jsonld from 'jsonld'
import JSON5 from 'json5'
import type { JsonLdDocument } from 'jsonld'

// Get directory path for ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Define types for context documents
type JsonLdContextDocument = {
  '@context'?: Record<string, unknown>
} & JsonLdDocument

// Source and build directories
const SOURCE_DIR = path.join(__dirname, 'source')
const BUILD_DIR = path.join(__dirname, 'build')

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
      // Use more compact JSON5 formatting
      const json5Options = {
        space: '',  // No indentation for maximum compression
        quote: '"',
        replacer: (key: string, value: any) => {
          if (typeof value === 'string') {
            // Remove quotes from valid identifiers and common URL prefixes
            if (/^[a-zA-Z$_][a-zA-Z0-9$_]*$/.test(value)) {
              return value
            }
            // Optimize common URL patterns
            if (value.startsWith('http://schema.org/')) {
              return value.replace('http://schema.org/', 'schema:')
            }
            if (value.startsWith('http://www.w3.org/')) {
              return value.replace('http://www.w3.org/', 'w3:')
            }
          }
          return value
        }
      }
      json5Output = JSON5.stringify(converted, json5Options.replacer)
        .replace(/"(\w+)":/g, '$1:') // Remove quotes from property names
        .replace(/,(?=\w)/g, ',\n') // Add some line breaks for readability
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

export async function buildContexts(): Promise<void> {
  try {
    console.log('Starting context build process...')

    // Ensure build directory exists
    console.log(`Creating build directory: ${BUILD_DIR}`)
    await fs.mkdir(BUILD_DIR, { recursive: true })

    // Get list of source files
    console.log(`Reading source directory: ${SOURCE_DIR}`)
    const files = await fs.readdir(SOURCE_DIR)
    const jsonldFiles = files.filter(f => f.endsWith('.jsonld'))
    console.log(`Found ${jsonldFiles.length} JSON-LD files:`, jsonldFiles)

    // Process each context file
    const exports: string[] = []
    for (const file of jsonldFiles) {
      const sourcePath = path.join(SOURCE_DIR, file)
      const outputName = path.basename(file, '.jsonld')
      const outputPath = path.join(BUILD_DIR, `${outputName}.ts`)

      try {
        console.log(`\nProcessing ${file}...`)
        await processContextFile(sourcePath, outputPath)
        exports.push(outputName)
      } catch (error) {
        console.error(`Failed to process ${file}:`, error)
        throw error
      }
    }

    // Generate index file
    console.log('\nGenerating index.ts...')
    const indexContent = `// Auto-generated index file
${exports.map(name => `import ${name} from './${name}'`).join('\n')}

export {
${exports.map(name => `  ${name},`).join('\n')}
}

export type { JsonLdDocument, ContextDefinition } from 'jsonld'
`

    const indexPath = path.join(BUILD_DIR, 'index.ts')
    await fs.writeFile(indexPath, indexContent)
    console.log('Build process complete!')
  } catch (error) {
    console.error('Build process failed:', error)
    process.exit(1)
  }
}

// Run build if this is the main module
const isMainModule = import.meta.url.endsWith(process.argv[1])

if (isMainModule) {
  console.log('Starting context build process...')
  console.log('Source directory:', SOURCE_DIR)
  console.log('Build directory:', BUILD_DIR)

  process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error)
    process.exit(1)
  })

  buildContexts().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}
