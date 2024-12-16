import fs from 'fs/promises'
import path from 'path'
import JSON5 from 'json5'

interface JsonLdContextDocument {
  '@context'?: Record<string, unknown>
  [key: string]: unknown
}

interface TransformOutput {
  content: string
  size: number
}

const SOURCE_DIR = path.join(process.cwd(), 'src', 'contexts', 'source')
const BUILD_DIR = path.join(process.cwd(), 'src', 'contexts', 'build')

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

async function transformContext(contextDoc: JsonLdContextDocument): Promise<TransformOutput> {
  const contextObj = contextDoc['@context'] || contextDoc

  const rootProps = Object.entries(contextObj).reduce((acc, [key, value]) => {
    if (key.startsWith('@')) {
      acc[key.replace('@', '$')] = value
    }
    return acc
  }, {} as Record<string, unknown>)

  const converted = Object.entries(contextObj).reduce((acc, [key, value]) => {
    const newKey = key.startsWith('@') ? key.replace('@', '$') : key
    if (typeof value === 'object' && value !== null) {
      acc[newKey] = Object.entries(value as Record<string, unknown>).reduce((innerAcc, [k, v]) => {
        const newInnerKey = k.startsWith('@') ? k.replace('@', '$') : k
        innerAcc[newInnerKey] = v
        return innerAcc
      }, {} as Record<string, unknown>)
    } else {
      acc[newKey] = value
    }
    return acc
  }, {} as Record<string, unknown>)

  const json5Options = {
    space: 2,
    quote: '"',
    replacer: (key: string, value: unknown) => {
      if (typeof value === 'string' && value.includes('://')) {
        return value
      }
      return value
    }
  }

  const filteredContext = { ...converted }

  const json5Output = JSON5.stringify(filteredContext, json5Options)

  return {
    content: json5Output,
    size: json5Output.length
  }
}

async function processContextFile(filePath: string): Promise<TransformOutput> {
  console.log(`Processing context file: ${filePath}`)
  try {
    const fileContent = await fs.readFile(filePath, 'utf-8')
    console.log(`Successfully read file: ${filePath}`)
    console.log(`File size: ${fileContent.length} bytes`)

    let contextData: JsonLdContextDocument
    try {
      contextData = JSON.parse(fileContent)
      console.log('Successfully parsed JSON')
    } catch (parseError) {
      console.error(`Error parsing JSON from ${filePath}:`, parseError)
      throw parseError
    }

    try {
      const output = await transformContext(contextData)
      console.log(`Successfully transformed context from ${filePath}`)
      return output
    } catch (transformError) {
      console.error(`Error transforming context from ${filePath}:`, transformError)
      throw transformError
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`Error processing file ${filePath}:`, errorMessage)
    throw new Error(`Failed to process context file ${filePath}: ${errorMessage}`)
  }
}

export async function buildContexts(): Promise<void> {
  console.log('\nStarting context build process...')

  try {
    await fs.mkdir(BUILD_DIR, { recursive: true })
    console.log(`Created build directory: ${BUILD_DIR}`)

    const jsonldFiles = await fs.readdir(SOURCE_DIR)
    const contextFiles = jsonldFiles.filter(file => file.endsWith('.jsonld'))
    console.log('Found context files:', contextFiles)

    const exports: Array<{ safe: string; original: string }> = []

    for (const file of contextFiles) {
      const sourcePath = path.join(SOURCE_DIR, file)
      const baseName = path.basename(file, '.jsonld')
      console.log(`\nProcessing ${baseName}...`)

      const safeIdentifier = baseName
        .replace(/[.-]/g, '_')
        .toLowerCase()
      console.log(`Generated safe identifier: ${safeIdentifier}`)

      const outputPath = path.join(BUILD_DIR, `${safeIdentifier}.ts`)
      console.log(`Output path: ${outputPath}`)

      try {
        const { content } = await processContextFile(sourcePath)
        const tsContent = `// Auto-generated from ${file}\nexport default ${content}\n`
        await fs.writeFile(outputPath, tsContent, 'utf-8')
        console.log(`Successfully generated ${outputPath}`)
        exports.push({ safe: safeIdentifier, original: baseName })
      } catch (error) {
        console.error(`Error processing ${file}:`, error)
        throw error
      }
    }

    console.log('\nGenerating index.ts...')
    const indexContent = `// Auto-generated index file
${exports.map(({ safe }) => `import ${safe}Context from './${safe}'`).join('\n')}

export {
${exports.map(({ safe }) => `  ${safe}Context,`).join('\n')}
}

export type { JsonLdDocument, ContextDefinition } from 'jsonld'
`
    await fs.writeFile(path.join(BUILD_DIR, 'index.ts'), indexContent, 'utf-8')
    console.log('Build process complete!')
  } catch (error) {
    console.error('Build process failed:', error)
    throw error
  }
}
