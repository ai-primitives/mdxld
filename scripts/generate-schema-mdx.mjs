import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const TYPES_DIR = join(__dirname, '../types/schema.org')
const SCHEMA_FILE = join(__dirname, '../src/contexts/source/schema.org.jsonld')

// Parse command line arguments
const args = process.argv.slice(2)
const typeArg = args.find(arg => arg.startsWith('--type='))
const singleType = typeArg ? typeArg.split('=')[1] : null

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

// Helper function to generate example values for properties
function generateExampleValue(range, name) {
  if (Array.isArray(range)) {
    // Use the first type in the range for the example
    return generateExampleValue(range[0], name)
  }

  const type = range['@id']
  switch (type) {
    case 'schema:Text':
    case 'schema:URL':
      return `"example-${name}"`
    case 'schema:Number':
    case 'schema:Integer':
      return '42'
    case 'schema:Boolean':
      return 'true'
    case 'schema:Date':
      return '"2024-01-20"'
    case 'schema:DateTime':
      return '"2024-01-20T12:00:00Z"'
    case 'schema:Time':
      return '"12:00:00"'
    default:
      return '{ /* Example object of type: ' + type.replace('schema:', '') + ' */ }'
  }
}

async function getTypeProperties(data, typeId, visited = new Set()) {
  if (visited.has(typeId)) return { direct: [], inherited: [] };
  visited.add(typeId);

  const type = data['@graph'].find(node => node['@id'] === typeId);
  if (!type) return { direct: [], inherited: [] };

  // Get direct properties
  const directProps = data['@graph']
    .filter(node =>
      node['@type'] === 'rdf:Property' &&
      node['schema:domainIncludes'] &&
      (Array.isArray(node['schema:domainIncludes'])
        ? node['schema:domainIncludes'].some(d => d['@id'] === typeId)
        : node['schema:domainIncludes']['@id'] === typeId)
    )
    .map(prop => ({
      label: prop['rdfs:label'],
      comment: prop['rdfs:comment'] || '',
      range: prop['schema:rangeIncludes'],
      required: false
    }));

  // Get inherited properties from parent
  const parentClass = type['rdfs:subClassOf']?.['@id'];
  const { direct: parentDirect, inherited: parentInherited } = parentClass
    ? await getTypeProperties(data, parentClass, visited)
    : { direct: [], inherited: [] };

  // Process inherited properties
  const inheritedProps = [...parentDirect, ...parentInherited].map(prop => ({
    ...prop,
    inheritedFrom: prop.inheritedFrom || parentClass.replace('schema:', '')
  }));

  return {
    direct: directProps,
    inherited: inheritedProps
  };
}

async function generateFrontmatter(type, data) {
  const typeId = `schema:${type}`;
  const { direct, inherited } = await getTypeProperties(data, typeId);

  const subClasses = data['@graph']
    .filter(node =>
      node['@type'] === 'rdfs:Class' &&
      node['rdfs:subClassOf']?.['@id'] === typeId
    )
    .map(s => s['rdfs:label'])
    .sort();

  const typeData = data['@graph'].find(n => n['@id'] === typeId);
  const parentClass = typeData['rdfs:subClassOf']?.['@id']?.replace('schema:', '');

  const frontmatter = {
    $context: 'schema.org',
    $type: type,
    title: type,
    description: type === 'Thing'
      ? 'The most generic type of item.'
      : typeData['rdfs:comment'],
    properties: {
      direct: direct.map(p => ({
        name: p.label,
        type: generateTypeScriptType(p.range),
        description: p.comment
      })),
      inherited: inherited.map(p => ({
        name: p.label,
        type: generateTypeScriptType(p.range),
        description: p.comment,
        inheritedFrom: p.inheritedFrom
      }))
    }
  };

  if (parentClass) {
    frontmatter.parentClass = parentClass;
  }

  if (subClasses.length > 0) {
    frontmatter.subClasses = subClasses;
  }

  return frontmatter;
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

async function generatePropertiesSection(type, data) {
  const typeId = `schema:${type}`;
  const { direct, inherited } = await getTypeProperties(data, typeId);

  return {
    direct: direct.map(p => ({
      name: p.label,
      description: p.comment,
      range: p.range
    })),
    inherited: inherited.map(p => ({
      name: p.label,
      description: p.comment,
      range: p.range,
      inheritedFrom: p.inheritedFrom
    }))
  };
}

async function generateMdxFile(type, data) {
  const frontmatter = await generateFrontmatter(type, data);
  const hierarchy = generateTypeHierarchy(type, data);
  const properties = await generatePropertiesSection(type, data);
  const typeData = data['@graph'].find(n => n['@id'] === `schema:${type}`);
  const parentClass = typeData['rdfs:subClassOf']?.['@id']?.replace('schema:', '');

  // Generate frontmatter section
  const frontmatterLines = [
    '---',
    '$context: schema.org',
    `$type: ${type}`,
    `title: ${type}`,
    `description: ${frontmatter.description}`,
    'properties:',
    '  direct:',
    ...frontmatter.properties.direct.map(p =>
      `    - name: ${p.name}\n      type: ${p.type}\n      description: ${p.description}`
    ),
    '  inherited:',
    ...frontmatter.properties.inherited.map(p =>
      `    - name: ${p.name}\n      type: ${p.type}\n      description: ${p.description}\n      inheritedFrom: ${p.inheritedFrom}`
    ),
    ...(frontmatter.subClasses?.length > 0 ? [
      'subClasses:',
      ...frontmatter.subClasses.map(s => `  - ${s}`)
    ] : []),
    ...(parentClass ? [`parentClass: ${parentClass}`] : []),
    '---',
    ''
  ];

  const frontmatterYaml = frontmatterLines.join('\n');

  // Generate content section
  const content = [
    `# ${type}`,
    '',
    hierarchy.description,
    '',
    '## Type Hierarchy',
    '',
    '### Parent Type',
    '',
    parentClass
      ? `**${type}** is a type of **${parentClass}**. It inherits all properties from its parent type.`
      : `**${type}** is the root type in the Schema.org hierarchy. All other types inherit from Thing either directly or indirectly.`,
    '',
    '### Direct Subtypes',
    '',
    hierarchy.subClasses.length > 0
      ? [
          `The following types directly inherit from **${type}**:`,
          '',
          hierarchy.subClasses
            .map(s => `- **${s.name}**: ${s.description}`)
            .join('\n')
        ].join('\n')
      : `No types directly inherit from **${type}**.`,
    '',
    '## Properties',
    '',
    '### Direct Properties',
    '',
    properties.direct.length > 0
      ? [
          `These properties are defined directly on the **${type}** type:`,
          '',
          properties.direct
            .map(p => `- **${p.name}**: ${p.description}`)
            .join('\n')
        ].join('\n')
      : `No properties are defined directly on the **${type}** type.`,
    '',
    '### Inherited Properties',
    '',
    properties.inherited.length > 0
      ? [
          `These properties are inherited from parent types:`,
          '',
          properties.inherited
            .map(p => `- **${p.name}**: ${p.description} (inherited from **${p.inheritedFrom}**)`)
            .join('\n')
        ].join('\n')
      : 'No inherited properties.',
    '',
    '## Usage Example',
    '',
    '```typescript',
    `interface ${type}${parentClass ? ` extends ${parentClass}` : ''} {`,
    '  /** The context URL for Schema.org */',
    '  $context?: \'schema.org\'',
    '',
    '  /** The type identifier */',
    `  $type: '${type}'`,
    '',
    '  // Direct properties',
    properties.direct
      .map(p => [
        `  /** ${p.description} */`,
        `  ${p.name}?: ${generateTypeScriptType(p.range)}`
      ].join('\n'))
      .join('\n\n'),
    '',
    '  // Inherited properties',
    properties.inherited
      .map(p => [
        `  /** ${p.description}`,
        `   * @inheritDoc Inherited from ${p.inheritedFrom}`,
        `   */`,
        `  ${p.name}?: ${generateTypeScriptType(p.range)}`
      ].join('\n'))
      .join('\n\n'),
    '}',
    '```',
    '',
    '## Example Usage',
    '',
    '```json',
    JSON.stringify({
      $context: 'schema.org',
      $type: type,
      ...(properties.direct.length > 0
        ? properties.direct
            .slice(0, 3)
            .reduce((acc, p) => ({
              ...acc,
              [p.name]: generateExampleValue(p.range, p.name)
            }), {})
        : {}),
      ...(properties.inherited.length > 0
        ? properties.inherited
            .slice(0, 3)
            .reduce((acc, p) => ({
              ...acc,
              [p.name]: generateExampleValue(p.range, p.name)
            }), {})
        : {})
    }, null, 2),
    '```',
    '',
    '## Notes',
    '',
    type === 'Thing'
      ? [
          '- Thing is the root type in Schema.org - it has no parent classes',
          '- All Schema.org types extend Thing, either directly or through inheritance',
          '- The properties defined on Thing are available on all other types',
          '- When using Thing directly, consider if a more specific type would be more appropriate',
          '- Contains essential properties that are inherited by all other types',
          `- Defines ${properties.direct.length} core properties used throughout the Schema.org hierarchy`
        ].join('\n')
      : [
          `- **${type}** is a type of **${parentClass || 'Thing'}** and inherits all its properties`,
          `- Defines ${properties.direct.length} direct properties specific to ${type}`,
          `- Inherits ${properties.inherited.length} properties from parent types`,
          hierarchy.subClasses.length > 0
            ? [
                `- Has ${hierarchy.subClasses.length} direct subtypes that inherit its properties`,
                '- Consider using a more specific subtype if it better matches your content',
                hierarchy.subClasses
                  .slice(0, 3)
                  .map(s => `  - **${s.name}**: ${s.description}`)
                  .join('\n')
              ].join('\n')
            : '- This is a leaf type with no subtypes - use it when no more specific type exists',
          '- Ensure all required properties are provided when using this type',
          '- Properties can be used from both direct and inherited sets',
          '- Use TypeScript interface above for proper type checking'
        ].join('\n')
  ].join('\n');

  return frontmatterYaml + content;
}

// Main function to generate all MDX files
async function main() {
  try {
    console.log('Reading schema.org context...')
    const data = JSON.parse(await readFile(SCHEMA_FILE, 'utf8'))

    console.log('Creating output directory...')
    await mkdir(TYPES_DIR, { recursive: true })

    if (singleType) {
      console.log(`Generating MDX for ${singleType}...`)
      const mdx = await generateMdxFile(singleType, data)
      await writeFile(join(TYPES_DIR, `${singleType}.mdx`), mdx)
      console.log('Done!')
      return
    }

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
