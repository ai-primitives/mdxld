import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSON5 from 'json5'

interface JsonLdContextDocument {
  '@context'?: Record<string, unknown>
  [key: string]: unknown
}

interface TransformOutput {
  content: string
  size: number
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SOURCE_DIR = path.join(__dirname, 'source')
const BUILD_DIR = path.join(__dirname, 'build')

async function ensureDirectories() {
  console.log('Ensuring directories exist...')
  console.log(`Source directory: ${SOURCE_DIR}`)
  console.log(`Build directory: ${BUILD_DIR}`)

  try {
    await fs.mkdir(SOURCE_DIR, { recursive: true })
    await fs.mkdir(BUILD_DIR, { recursive: true })
    console.log('Directories created/verified successfully')
  } catch (error) {
    console.error('Error creating directories:', error)
    throw error
  }
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function convertAtToDollar(obj: Record<string, unknown>): Record<string, unknown> {
  if (typeof obj !== 'object' || obj === null) return obj as Record<string, unknown>

  if (Array.isArray(obj)) {
    return obj.map(item => convertAtToDollar(item as Record<string, unknown>))
  }

  return Object.entries(obj).reduce((acc: Record<string, unknown>, [key, value]) => {
    const newKey = key.startsWith('@') ? `$${key.slice(1)}` : key
    acc[newKey] = convertAtToDollar(value as Record<string, unknown>)
    return acc
  }, {})
}

async function transformContext(content: string): Promise<TransformOutput> {
  console.log('Starting context transformation...')

  try {
    const parsed = JSON.parse(content) as JsonLdContextDocument
    console.log('Successfully parsed JSON')

    // Extract root level properties before transformation
    const rootProps: Record<string, unknown> = {}

    // Handle @context specially
    if (parsed['@context']) {
      const contextObj = parsed['@context']

      // Special handling for schema.org context
      if (typeof contextObj === 'object' && contextObj !== null) {
        // If this is the schema.org context (has schema key with https://schema.org/ value)
        if ('schema' in contextObj && contextObj.schema === 'https://schema.org/') {
          rootProps.$vocab = 'http://schema.org/'
        }
        // For other contexts, look for @vocab
        else if ('@vocab' in contextObj) {
          rootProps.$vocab = contextObj['@vocab']
        }
      }

      // Store the context after converting @ to $
      rootProps.$context = convertAtToDollar(contextObj)
    }

    // Convert @ to $ in the entire context
    console.log('Converting @ to $ in context...')
    const converted = convertAtToDollar(parsed)

    // Remove @context from converted since we've already handled it
    if ('$context' in converted) {
      delete converted.$context
    }
    if ('@context' in converted) {
      delete converted['@context']
    }

    // Create final object with root properties first
    const finalObject = {
      ...rootProps,
      ...converted
    }

    console.log('Final object:', JSON.stringify(finalObject, null, 2))

    console.log('Preparing JSON5 options...')
    const json5Options = {
      space: 2,
      quote: '"',
      replacer: null
    }

    console.log('Stringifying to JSON5...')
    const output = JSON5.stringify(finalObject, json5Options)
    console.log('Successfully stringified to JSON5')

    return {
      content: output,
      size: output.length
    }
  } catch (error) {
    console.error('Error in transformContext:', error instanceof Error ? error.message : String(error))
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available')
    throw error
  }
}

async function processContextFile(filePath: string): Promise<TransformOutput> {
  console.log(`\nProcessing file: ${filePath}`)
  console.log('Checking file existence...')

  try {
    const stats = await fs.stat(filePath)
    console.log(`File exists (size: ${stats.size} bytes)`)

    console.log('Reading file content...')
    const content = await fs.readFile(filePath, 'utf-8')
    console.log(`Successfully read ${content.length} bytes`)

    console.log('Transforming content...')
    const result = await transformContext(content)
    console.log(`Transformation complete (${result.size} bytes)`)

    return result
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error instanceof Error ? error.message : String(error))
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available')
    throw error
  }
}

async function copySourceFile(sourcePath: string, buildPath: string): Promise<void> {
  console.log(`Copying ${sourcePath} to ${buildPath}...`)
  try {
    const content = await fs.readFile(sourcePath, 'utf-8')
    await fs.writeFile(buildPath, content)
    console.log(`Successfully copied ${sourcePath}`)
  } catch (error) {
    console.error(`Error copying ${sourcePath}:`, error)
    throw error
  }
}

export async function buildContexts(): Promise<void> {
  console.log('\nStarting context build process...')

  try {
    await ensureDirectories()

    console.log(`Reading source directory: ${SOURCE_DIR}`)
    const files = await fs.readdir(SOURCE_DIR)
    console.log('All files in source directory:', files)
    const contextFiles = files.filter(file => file.endsWith('.jsonld'))
    console.log('Found context files:', contextFiles)

    if (contextFiles.length === 0) {
      console.error('No .jsonld files found in source directory')
      throw new Error('No .jsonld files found in source directory')
    }

    const exports: Array<{ safe: string; original: string }> = []

    for (const file of contextFiles) {
      const sourcePath = path.join(SOURCE_DIR, file)
      const baseName = path.basename(file, '.jsonld')
      console.log(`\nProcessing ${baseName}...`)

      const safeIdentifier = baseName
        .replace(/[.-]/g, '_')
        .toLowerCase()
      console.log(`Safe identifier: ${safeIdentifier}`)

      try {
        const buildJsonLdPath = path.join(BUILD_DIR, file)
        await copySourceFile(sourcePath, buildJsonLdPath)

        const { content } = await processContextFile(sourcePath)

        const tsContent = `// Generated from ${file}
export const ${safeIdentifier} = ${content} as const
export type ${capitalize(safeIdentifier)} = typeof ${safeIdentifier}
export default ${safeIdentifier}`

        const tsFilePath = path.join(BUILD_DIR, `${safeIdentifier}.ts`)
        console.log(`Writing TypeScript file: ${tsFilePath}`)
        await fs.writeFile(tsFilePath, tsContent)
        console.log(`Successfully generated TypeScript module: ${tsFilePath}`)

        exports.push({ safe: safeIdentifier, original: baseName })
      } catch (error) {
        console.error(`Error processing ${file}:`, error instanceof Error ? error.message : String(error))
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available')
        throw error
      }
    }

    const indexContent = `// Generated exports for JSON-LD contexts
${exports.map(({ safe }) => `import { ${safe} } from './${safe}.js'`).join('\n')}

export type {
  ${exports.map(({ safe }) => `${capitalize(safe)}`).join(',\n  ')}
}

export {
  ${exports.map(({ safe }) => safe).join(',\n  ')}
}

export default {
  ${exports.map(({ safe }) => `${safe}`).join(',\n  ')}
}`

    const indexPath = path.join(BUILD_DIR, 'index.ts')
    console.log('\nWriting index.ts...')
    await fs.writeFile(indexPath, indexContent)
    console.log('Successfully generated index.ts with context exports')

  } catch (error) {
    console.error('Error in buildContexts:', error instanceof Error ? error.message : String(error))
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available')
    process.exit(1)
  }
}
