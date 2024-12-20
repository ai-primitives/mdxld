import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const TYPES_DIR = join(__dirname, '../types/schema.org')
const SCHEMA_FILE = join(__dirname, '../src/contexts/source/schema.org.jsonld')

// Constants for type ordering and hierarchy
const subClassOrder = [
  'Action',
  'Organization',
  'Intangible',
  'CreativeWork',
  'Event',
  'Product',
  'Person',
  'BioChemEntity',
  'MedicalEntity',
  'Place',
  'Taxon'
]

// Helper functions for TypeScript type generation
function generateTypeScriptType(range) {
  if (Array.isArray(range)) {
    // Deduplicate types and ensure consistent ordering
    const types = new Set(range.map(r => mapSchemaType(r['@id'])))
    return Array.from(types).sort().join(' | ')
  }
  return mapSchemaType(range['@id'])
}

function mapSchemaType(schemaType) {
  // Base type mappings
  const typeMap = {
    'schema:Text': 'string',
    'schema:URL': 'string',
    'schema:Number': 'number',
    'schema:Integer': 'number',
    'schema:Boolean': 'boolean',
    'schema:Date': 'string',
    'schema:DateTime': 'string',
    'schema:Time': 'string',
    'schema:PropertyValue': 'PropertyValue',
    'schema:ImageObject': 'ImageObject',
    'schema:CreativeWork': 'CreativeWork',
    'schema:Event': 'Event',
    'schema:Action': 'Action'
  }

  // Special cases for Thing properties to match template exactly
  const propertyTypeMap = {
    'schema:mainEntityOfPage': 'CreativeWork | string',
    'schema:subjectOf': 'CreativeWork | Event',
    'schema:image': 'ImageObject | string',
    'schema:identifier': 'PropertyValue | string',
    'schema:additionalType': 'string',
    'schema:description': 'string',
    'schema:url': 'string',
    'schema:sameAs': 'string',
    'schema:TextObject': 'string'
  }

  return propertyTypeMap[schemaType] || typeMap[schemaType] || schemaType.replace('schema:', '')
}

function generateFrontmatter(type, data) {
  // Define the exact order for Thing properties
  const propertyOrder = [
    'name',
    'description',
    'url',
    'identifier',
    'image',
    'additionalType',
    'disambiguatingDescription',
    'potentialAction',
    'subjectOf',
    'sameAs',
    'alternateName',
    'mainEntityOfPage'
  ]

  const properties = type === 'Thing'
    ? propertyOrder
    : data['@graph']
        .filter(node =>
          node['@type'] === 'rdf:Property' &&
          node['schema:domainIncludes']?.['@id'] === `schema:${type}`
        )
        .map(p => p['rdfs:label'])
        .sort()

  const subClasses = type === 'Thing'
    ? subClassOrder
    : data['@graph']
        .filter(node =>
          node['@type'] === 'rdfs:Class' &&
          node['rdfs:subClassOf']?.['@id'] === `schema:${type}`
        )
        .map(s => s['rdfs:label'])
        .sort()

  return {
    $context: 'schema.org',
    $type: type,
    title: type,
    description: type === 'Thing'
      ? 'The most generic type of item.'
      : data['@graph'].find(n => n['@id'] === `schema:${type}`)['rdfs:comment'],
    properties,
    subClasses
  }
}

function generateTypeHierarchy(type, data) {
  const thingSubclassDescriptions = {
    'Action': 'An action performed by a direct agent upon a direct object.',
    'Organization': 'An organization such as a school, NGO, corporation, club, etc.',
    'Intangible': 'A utility type that groups together intangible things.',
    'CreativeWork': 'The most generic kind of creative work.',
    'Event': 'An event happening at a certain time and location.',
    'Product': 'Any offered product or service.',
    'BioChemEntity': 'Any biological, chemical, or biochemical thing.',
    'MedicalEntity': 'The most generic type for medical entities.',
    'Place': 'Entities with a somewhat fixed physical extension.',
    'Person': 'A person (alive, dead, undead, or fictional).',
    'Taxon': 'A set of organisms representing a natural biological unit.'
  }

  const typeData = data['@graph'].find(n => n['@id'] === `schema:${type}`)
  const subClasses = data['@graph']
    .filter(node =>
      node['@type'] === 'rdfs:Class' &&
      node['rdfs:subClassOf']?.['@id'] === `schema:${type}`
    )
    .sort((a, b) => a['rdfs:label'].localeCompare(b['rdfs:label']))

  return {
    description: type === 'Thing' ? 'The most generic type of item.' : typeData['rdfs:comment'],
    subClasses: subClasses.map(s => ({
      name: s['rdfs:label'],
      description: type === 'Thing' ? thingSubclassDescriptions[s['rdfs:label']] : s['rdfs:comment']
    }))
  }
}

function generatePropertiesSection(type, data) {
  // Define shorter descriptions for Thing properties
  const thingPropertyDescriptions = {
    'name': 'The name of the item',
    'description': 'A description of the item',
    'url': 'URL of the item',
    'identifier': 'Any kind of identifier for the item',
    'image': 'An image of the item',
    'additionalType': 'An additional type for the item',
    'disambiguatingDescription': 'A description that disambiguates this item from others',
    'potentialAction': 'Indicates a potential Action that describes an idealized action',
    'subjectOf': 'A CreativeWork or Event about this Thing',
    'sameAs': 'URL of a reference Web page that unambiguously indicates the item\'s identity',
    'alternateName': 'An alias for the item',
    'mainEntityOfPage': 'Indicates a page for which this thing is the main entity being described'
  }

  return data['@graph']
    .filter(node =>
      node['@type'] === 'rdf:Property' &&
      node['schema:domainIncludes']?.['@id'] === `schema:${type}`
    )
    .sort((a, b) => {
      if (type === 'Thing') {
        const orderA = Object.keys(thingPropertyDescriptions).indexOf(a['rdfs:label'])
        const orderB = Object.keys(thingPropertyDescriptions).indexOf(b['rdfs:label'])
        return orderA - orderB
      }
      return a['rdfs:label'].localeCompare(b['rdfs:label'])
    })
    .map(p => ({
      name: p['rdfs:label'],
      description: type === 'Thing' ? thingPropertyDescriptions[p['rdfs:label']] : p['rdfs:comment'],
      range: p['schema:rangeIncludes']
    }))
}

async function generateMdxFile(type, data) {
  const frontmatter = generateFrontmatter(type, data)
  const hierarchy = generateTypeHierarchy(type, data)
  const properties = generatePropertiesSection(type, data)
  const typeData = data['@graph'].find(n => n['@id'] === `schema:${type}`)
  const parentClass = typeData['rdfs:subClassOf']?.['@id']?.replace('schema:', '')

  return `---
$context: schema.org
$type: ${type}
title: ${type}
description: ${frontmatter.description}
properties:
${frontmatter.properties.map(p => `  - ${p}`).join('\n')}
subClasses:
${frontmatter.subClasses.map(s => `  - ${s}`).join('\n')}
${parentClass ? `parentClass: ${parentClass}` : ''}
---

# ${type}

${hierarchy.description}

## Type Hierarchy

${parentClass
  ? `${type} is a type of ${parentClass}.`
  : `${type} is the root type in the Schema.org hierarchy. All other types inherit from Thing either directly or indirectly.`}

### Direct Subtypes

${hierarchy.subClasses.length > 0
  ? `The following types directly inherit from ${type}:\n\n${hierarchy.subClasses
      .map(s => `- ${s.name}: ${s.description}`)
      .join('\n')}`
  : `No types directly inherit from ${type}.`}

## Properties

${type === 'Thing'
  ? `${type} defines the following core properties that are inherited by all other types:`
  : `${type} defines the following properties in addition to those inherited from ${parentClass || 'Thing'}:`}

${properties
  .map(p => `- ${p.name}: ${p.description}`)
  .join('\n')}

## Usage Example

\`\`\`typescript
interface ${type} {
  $context?: 'schema.org'
  $type: '${type}'
${properties
  .map(p => `  ${p.name}?: ${generateTypeScriptType(p.range)}`)
  .join('\n')}
}
\`\`\`

## Example Usage

\`\`\`json
{
  "$context": "schema.org",
  "$type": "${type}",
  "name": "Example ${type}",
  "description": "An example of the ${type} type",
  "url": "https://example.com/${type.toLowerCase()}",
  "identifier": "example-${type.toLowerCase()}-1"
}
\`\`\`

## Notes

${type === 'Thing'
  ? `- Thing is the root type in Schema.org - it has no parent classes
- All Schema.org types extend Thing, either directly or through inheritance
- The properties defined on Thing are available on all other types
- When using Thing directly, consider if a more specific type would be more appropriate`
  : `- ${type} inherits all properties from ${parentClass || 'Thing'}
- Consider using more specific subtypes if available
- Ensure all required properties are provided
- Use appropriate property types as defined in the interface`}
`
}

// Get all types from schema.org context
function getAllTypes(data) {
  return data['@graph']
    .filter(node => node['@type'] === 'rdfs:Class')
    .map(node => node['@id'].replace('schema:', ''))
}

// Main function to generate all MDX files
async function main() {
  try {
    console.log('Reading schema.org context...')
    const data = JSON.parse(await readFile(SCHEMA_FILE, 'utf8'))

    console.log('Creating output directory...')
    await mkdir(TYPES_DIR, { recursive: true })

    const types = getAllTypes(data)
    console.log(`Found ${types.length} types to process`)

    for (const type of types) {
      try {
        console.log(`Generating MDX for ${type}...`)
        const mdx = await generateMdxFile(type, data)
        await writeFile(join(TYPES_DIR, `${type}.mdx`), mdx)
      } catch (error) {
        console.error(`Error generating ${type}.mdx:`, error)
      }
    }

    console.log('Completed generating all MDX files')
  } catch (error) {
    console.error('Fatal error:', error)
    process.exit(1)
  }
}

main()
