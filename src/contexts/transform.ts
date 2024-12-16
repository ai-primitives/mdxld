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
    const parsed = JSON.parse(content) as JsonLdContextDocument
    console.log('Successfully parsed JSON')

    const rootProps = ['@context', '@id', '@type', '@base']
    console.log('Converting @ to $ for properties:', rootProps)

    const converted = convertAtToDollar(parsed)
    console.log('Successfully converted @ to $')

    const json5Options = {
      space: 2,
      quote: '"',
      replacer: null
    }

    const output = JSON5.stringify(converted, json5Options)
    console.log(`Successfully stringified to JSON5 (${output.length} bytes)`)

    return {
      content: output,
      size: output.length
    }
  } catch (error) {
    console.error('Error in transformContext:', error)
    throw error
  }
}

async function processContextFile(filePath: string): Promise<TransformOutput> {
  console.log(`\nProcessing file: ${filePath}`)
  console.log(`File exists: ${await fs.access(filePath).then(() => true).catch(() => false)}`)

  try {
    const content = await fs.readFile(filePath, 'utf-8')
    console.log(`Read file: ${filePath} (${content.length} bytes)`)
    console.log('First 100 characters:', content.slice(0, 100))

    return await transformContext(content)
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error)
    throw error
  }
}

export async function buildContexts(): Promise<void> {
  console.log('\nStarting context build process...')

  try {
    await ensureDirectories()

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
const context = ${content} as const;
export type Context = typeof context;
export default context;`

        const tsFilePath = path.join(BUILD_DIR, `${safeIdentifier}.ts`)
        await fs.writeFile(tsFilePath, tsContent)
        console.log(`Generated TypeScript module: ${tsFilePath}`)

        exports.push({ safe: safeIdentifier, original: baseName })
      } catch (error) {
        console.error(`Error processing ${file}:`, error)
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
    await fs.writeFile(indexPath, indexContent)
    console.log('\nGenerated index.ts with context exports')

  } catch (error) {
    console.error('Error in buildContexts:', error)
    process.exit(1)
  }
}
