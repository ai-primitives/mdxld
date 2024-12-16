import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
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
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')
const SOURCE_DIR = path.join(PROJECT_ROOT, 'src', 'contexts', 'source')
const BUILD_DIR = path.join(PROJECT_ROOT, 'src', 'contexts', 'build')

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

function convertAtToDollar(obj: any): any {
  if (typeof obj !== 'object' || obj === null) return obj

  if (Array.isArray(obj)) {
    return obj.map(convertAtToDollar)
  }

  return Object.entries(obj).reduce((acc: any, [key, value]) => {
    const newKey = key.startsWith('@') ? `$${key.slice(1)}` : key
    acc[newKey] = convertAtToDollar(value)
    return acc
  }, {})
}

async function transformContext(content: string): Promise<TransformOutput> {
  console.log('Transforming context...')

  try {
    console.log('Parsing JSON content...')
    const parsed = JSON.parse(content) as JsonLdContextDocument
    console.log('Successfully parsed JSON')

    console.log('Converting @ to $ in context...')
    const converted = convertAtToDollar(parsed)
    console.log('Successfully converted @ to $')

    if (!converted.$context && converted.context) {
      console.log('Moving context to $context...')
      converted.$context = converted.context
      delete converted.context
    }

    const specialKeys = ['vocab', 'version', 'base']
    for (const key of specialKeys) {
      if (converted[key]) {
        console.log(`Converting ${key} to $${key}...`)
        converted[`$${key}`] = converted[key]
        delete converted[key]
      }
    }

    const json5Options = {
      space: 2,
      quote: '"',
      replacer: null
    }

    console.log('Stringifying to JSON5...')
    const output = JSON5.stringify(converted, json5Options)
    console.log(`Successfully stringified to JSON5 (${output.length} bytes)`)

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

  try {
    console.log(`Checking if file exists: ${filePath}`)
    await fs.access(filePath)
    console.log('File exists, reading content...')

    const content = await fs.readFile(filePath, 'utf-8')
    console.log(`Read file: ${filePath} (${content.length} bytes)`)
    console.log('First 100 characters:', content.slice(0, 100))

    const result = await transformContext(content)
    console.log(`Transformed content size: ${result.size} bytes`)

    return result
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`File not found: ${filePath}`)
    } else {
      console.error(`Error processing ${filePath}:`, error instanceof Error ? error.message : String(error))
      console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available')
    }
    throw error
  }
}

export async function buildContexts(): Promise<void> {
  console.log('\nStarting context build process...')

  try {
    await ensureDirectories()

    console.log(`Reading source directory: ${SOURCE_DIR}`)
    const files = await fs.readdir(SOURCE_DIR)
    const contextFiles = files.filter(file => file.endsWith('.jsonld'))
    console.log('Found context files:', contextFiles)

    if (contextFiles.length === 0) {
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

      try {
        const { content } = await processContextFile(sourcePath)

        const tsContent = `// Generated from ${file}
export const context = ${content} as const
export type Context = typeof context
export default context`

        const tsFilePath = path.join(BUILD_DIR, `${safeIdentifier}.ts`)
        console.log(`Writing TypeScript file: ${tsFilePath}`)
        await fs.writeFile(tsFilePath, tsContent)
        console.log(`Generated TypeScript module: ${tsFilePath}`)

        exports.push({ safe: safeIdentifier, original: baseName })
      } catch (error) {
        console.error(`Error processing ${file}:`, error instanceof Error ? error.message : String(error))
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available')
        throw error
      }
    }

    const indexContent = `${exports.map(({ safe }) => `import ${safe}Context, { Context as ${safe}ContextType } from './${safe}'`).join('\n')}

export type {
  ${exports.map(({ safe }) => `${safe}ContextType`).join(',\n  ')}
}

export {
  ${exports.map(({ safe }) => `${safe}Context`).join(',\n  ')}
}

export default {
  ${exports.map(({ safe }) => `${safe}: ${safe}Context`).join(',\n  ')}
}`

    const indexPath = path.join(BUILD_DIR, 'index.ts')
    console.log('\nWriting index.ts...')
    await fs.writeFile(indexPath, indexContent)
    console.log('Generated index.ts with context exports')

  } catch (error) {
    console.error('Error in buildContexts:', error instanceof Error ? error.message : String(error))
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available')
    process.exit(1)
  }
}
