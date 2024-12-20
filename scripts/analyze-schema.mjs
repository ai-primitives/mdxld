import { readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const schemaFile = join(__dirname, '../src/contexts/source/schema.org.jsonld');

async function getInheritedProperties(data, typeId, visited = new Set()) {
  if (visited.has(typeId)) return [];
  visited.add(typeId);

  const type = data['@graph'].find(node => node['@id'] === typeId);
  if (!type) return [];

  const directProps = data['@graph'].filter(node =>
    node['@type'] === 'rdf:Property' &&
    node['schema:domainIncludes'] &&
    (Array.isArray(node['schema:domainIncludes'])
      ? node['schema:domainIncludes'].some(d => d['@id'] === typeId)
      : node['schema:domainIncludes']['@id'] === typeId)
  );

  const parentClass = type['rdfs:subClassOf']?.['@id'];
  const inheritedProps = parentClass
    ? await getInheritedProperties(data, parentClass, visited)
    : [];

  const allProps = [...inheritedProps];
  for (const prop of directProps) {
    const existingIndex = allProps.findIndex(p => p['@id'] === prop['@id']);
    if (existingIndex >= 0) {
      allProps[existingIndex] = prop;
    } else {
      allProps.push(prop);
    }
  }

  return allProps;
}

async function analyzeSchema() {
  try {
    console.log('Reading schema.org.jsonld...');
    const content = await readFile(schemaFile, 'utf8');
    const data = JSON.parse(content);

    console.log('\nAnalyzing inheritance patterns:');

    const types = ['schema:Thing', 'schema:Person', 'schema:Place', 'schema:Organization'];

    for (const typeId of types) {
      console.log(`\nAnalyzing type: ${typeId}`);

      const type = data['@graph'].find(node => node['@id'] === typeId);
      if (!type) continue;

      const allProps = await getInheritedProperties(data, typeId);

      const directProps = data['@graph'].filter(node =>
        node['@type'] === 'rdf:Property' &&
        node['schema:domainIncludes'] &&
        (Array.isArray(node['schema:domainIncludes'])
          ? node['schema:domainIncludes'].some(d => d['@id'] === typeId)
          : node['schema:domainIncludes']['@id'] === typeId)
      );

      console.log('Properties Summary:');
      console.log('- Total properties:', allProps.length);
      console.log('- Direct properties:', directProps.length);
      console.log('- Inherited properties:', allProps.length - directProps.length);

      const subclasses = data['@graph'].filter(node =>
        node['@type'] === 'rdfs:Class' &&
        node['rdfs:subClassOf'] &&
        (Array.isArray(node['rdfs:subClassOf'])
          ? node['rdfs:subClassOf'].some(s => s['@id'] === typeId)
          : node['rdfs:subClassOf']['@id'] === typeId)
      );

      console.log('Subclasses:', subclasses.length > 0 ? subclasses.length : 'None');
    }

  } catch (error) {
    console.error('Error analyzing schema:', error);
    process.exit(1);
  }
}

analyzeSchema();
