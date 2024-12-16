import { writeFile } from 'fs/promises'
import { join } from 'path'
import { fileURLToPath } from 'url'
import axios from 'axios'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

async function downloadContext(url, filename) {
  console.log(`Downloading ${url} to ${filename}...`)
  try {
    const response = await axios.get(url, {
      headers: {
        'Accept': 'application/ld+json',
        'User-Agent': 'Mozilla/5.0 (compatible; mdxld/1.0)'
      },
      timeout: 10000, // 10 second timeout
      responseType: 'text'
    })

    // Verify it's valid JSON-LD
    try {
      JSON.parse(response.data)
      console.log('Successfully validated JSON-LD content')
    } catch (e) {
      throw new Error(`Invalid JSON-LD from ${url}: ${e.message}`)
    }

    await writeFile(filename, response.data, 'utf8')
    console.log(`Successfully downloaded ${filename}`)
  } catch (error) {
    if (error.response) {
      throw new Error(`Failed to download ${url}: ${error.response.status} ${error.response.statusText}`)
    } else if (error.request) {
      throw new Error(`Network error downloading ${url}: ${error.message}`)
    } else {
      throw new Error(`Error downloading ${url}: ${error.message}`)
    }
  }
}

const contexts = [
  {
    url: 'https://schema.org/docs/jsonldcontext.json',
    filename: join(__dirname, '../src/contexts/source/schema.org.jsonld')
  },
  {
    url: 'https://ref.gs1.org/standards/epcis/epcis-context.jsonld',
    filename: join(__dirname, '../src/contexts/source/epcis-context.jsonld')
  },
  {
    url: 'https://ref.gs1.org/standards/epcis/epcis-ontology.jsonld',
    filename: join(__dirname, '../src/contexts/source/epcis-ontology.jsonld')
  }
]

async function main() {
  console.log('Starting context downloads...')
  for (const context of contexts) {
    try {
      await downloadContext(context.url, context.filename)
    } catch (error) {
      console.error(`Failed to process ${context.url}:`, error.message)
      process.exit(1)
    }
  }
  console.log('All contexts downloaded successfully')
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
