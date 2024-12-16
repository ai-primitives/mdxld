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
    let newValue = value
    if (typeof value === 'object') {
      newValue = convertAtToDollar(value)
    } else if (typeof value === 'string') {
      newValue = value.startsWith('@') && !value.includes('://') ? `$${value.slice(1)}` : value
    }
    result[newKey] = newValue
  }
  return result
}

async function transformContext(input: JsonLdContextDocument): Promise<[string, any]> {
  try {
    console.log('\nTransforming context...')
    let contextSize: number
    let contextObj: any

    // Extract context object, handling both direct and wrapped contexts
    try {
      // Handle nested @context structures
      contextObj = input['@context']
        ? (typeof input['@context'] === 'object' ? input['@context'] : input)
        : input

      const contextStr = JSON.stringify(contextObj)
      contextSize = contextStr.length
      console.log(`Input context size: ${contextSize} bytes`)
      console.log('Context structure:', Object.keys(contextObj).join(', '))

      if (!contextObj || typeof contextObj !== 'object') {
        throw new Error('Invalid context structure')
      }

      // Debug context structure
      console.log('Context @vocab:', contextObj['@vocab'])
      console.log('Context epcis prefix:', contextObj['epcis'])
    } catch (e) {
      console.error('Error processing context:', e)
      throw e
    }

    // Convert @ prefixes to $ prefixes while preserving structure
    console.log('\nConverting prefixes...')
    let converted
    try {
      // Create a deep copy to avoid modifying the original
      const contextCopy = JSON.parse(JSON.stringify(contextObj))

      // Handle root level properties first
      const rootProps = {
        // Use epcis prefix URL as $vocab if available, otherwise use @vocab or empty string
        $vocab: contextCopy['epcis'] || contextCopy['@vocab'] || '',
        $version: contextCopy['@version'] || '1.0'
      }

      // Debug root properties
      console.log('Root properties:', JSON.stringify(rootProps))

      delete contextCopy['@vocab']
      delete contextCopy['@version']

      // Convert remaining properties
      converted = {
        ...rootProps,
        ...convertAtToDollar(contextCopy)
      }

      if (!converted || typeof converted !== 'object') {
        throw new Error('Invalid conversion result')
      }

      console.log('Prefix conversion complete')
      console.log('Converted structure:', Object.keys(converted).join(', '))
    } catch (e) {
      console.error('Error converting prefixes:', e)
      throw e
    }

    // Convert to JSON5 string (more compact than JSON)
    console.log('\nGenerating JSON5...')
    let json5Output: string
    try {
      const json5Options = {
        space: '',  // No indentation for maximum compression
        quote: '"',
        replacer: (key: string, value: any) => {
          if (typeof value === 'string' && value.includes('://')) {
            return value
          }
          if (typeof value === 'string' && /^[a-zA-Z$_][a-zA-Z0-9$_]*$/.test(value)) {
            return value
          }
          return value
        }
      }

      const filteredContext = Object.fromEntries(
        Object.entries(converted).filter(([key]) => !['$vocab', '$version'].includes(key))
      )

      json5Output = JSON5.stringify(filteredContext, json5Options.replacer)
        .replace(/"(\w+)":/g, '$1:') // Remove quotes from property names where safe
        .replace(/,(?=\w)/g, ',\n') // Add some line breaks for readability

      const outputSize = json5Output.length
      console.log(`Output size: ${outputSize} bytes (${Math.round((outputSize / contextSize) * 100)}% of original)`)
    } catch (e) {
      console.error('Error generating JSON5:', e)
      throw e
    }

    return [json5Output, converted]
  } catch (error) {
    console.error('Error in transformContext:', error)
    throw error
  }
}

async function processContextFile(filepath: string, filename: string): Promise<void> {
  console.log(`\nProcessing ${filepath}...`)
  console.log('Reading file...')

  try {
    const content = await fs.readFile(filepath, 'utf-8')
    console.log(`File content size: ${content.length} bytes`)

    console.log('Parsing JSON-LD...')
    const contextDoc = JSON.parse(content)
    console.log('JSON structure:', Object.keys(contextDoc).join(', '))
    console.log('Context keys:', JSON.stringify(Object.keys(contextDoc['@context'] || contextDoc), null, 2))

    console.log('Starting transformation...')
    const [transformed, converted] = await transformContext(contextDoc)
    console.log('Transformation complete')

    const outputPath = path.join(BUILD_DIR, filename.replace('.jsonld', '.ts'))
    const output = `// Auto-generated from ${filename}
const context = {
  $vocab: ${JSON.stringify(converted.$vocab || '')},
  $version: ${JSON.stringify(converted.$version || '1.0')},
  ...${transformed}
} as const;
export default context;`

    console.log('Writing output...')
    await fs.mkdir(BUILD_DIR, { recursive: true })
    await fs.writeFile(outputPath, output, 'utf-8')
    console.log(`Generated ${outputPath}\n`)
  } catch (error) {
    console.error(`Error processing file ${filepath}:`, error)
    throw error
  }
}

export async function buildContexts(): Promise<void> {
  try {
    console.log('Starting context build process...')

    console.log(`Creating build directory: ${BUILD_DIR}`)
    await fs.mkdir(BUILD_DIR, { recursive: true })

    console.log(`Reading source directory: ${SOURCE_DIR}`)
    const files = await fs.readdir(SOURCE_DIR)
    const jsonldFiles = files.filter(f => f.endsWith('.jsonld'))
    console.log(`Found ${jsonldFiles.length} JSON-LD files:`, jsonldFiles)

    const exports: Array<{ original: string; safe: string }> = []
    for (const file of jsonldFiles) {
      const sourcePath = path.join(SOURCE_DIR, file)
      const baseName = path.basename(file, '.jsonld')
      // Convert filename to valid TypeScript identifier
      const safeIdentifier = baseName
        .replace(/[.-]/g, '_')  // Replace dots and hyphens with underscores
        .replace(/^(\d)/, '_$1')  // Prefix with underscore if starts with number
      const outputPath = path.join(BUILD_DIR, `${safeIdentifier}.ts`)

      try {
        console.log(`\nProcessing ${file}...`)
        await processContextFile(sourcePath, file)
        exports.push({ original: baseName, safe: safeIdentifier })
      } catch (error) {
        console.error(`Failed to process ${file}:`, error)
        throw error
      }
    }

    console.log('\nGenerating index.ts...')
    const indexContent = `// Auto-generated index file
${exports.map(({ safe }) => `import ${safe}Context from './${safe}'`).join('\n')}

export {
${exports.map(({ safe, original }) => `  ${safe}Context as ${original.replace(/[.-]/g, '')},`).join('\n')}
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
