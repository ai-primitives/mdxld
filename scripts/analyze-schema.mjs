import { readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const schemaFile = join(__dirname, '../src/contexts/source/schema.org.jsonld');

async function analyzeSchema() {
  try {
    console.log('Reading schema.org.jsonld...');
    const content = await readFile(schemaFile, 'utf8');
    const data = JSON.parse(content);

    // Analyze Thing type specifically
    const things = data['@graph'].filter(node =>
      node['@type'] === 'rdfs:Class' &&
      (node['@id'] === 'schema:Thing' ||
       (node['rdfs:subClassOf'] && node['rdfs:subClassOf']['@id'] === 'schema:Thing'))
    );

    console.log('\nAnalyzing Thing type:');
    const thingDef = things.find(t => t['@id'] === 'schema:Thing');
    if (thingDef) {
      console.log('\nThing Definition:');
      console.log(JSON.stringify(thingDef, null, 2));
    }

    console.log('\nDirect subclasses of Thing:');
    const subclasses = things.filter(t =>
      t['@id'] !== 'schema:Thing' &&
      t['rdfs:subClassOf'] &&
      t['rdfs:subClassOf']['@id'] === 'schema:Thing'
    );
    console.log(subclasses.map(s => ({
      id: s['@id'],
      label: s['rdfs:label'],
      comment: s['rdfs:comment']
    })));

    // Analyze property structure
    console.log('\nAnalyzing property structure:');
    const properties = data['@graph'].filter(node =>
      node['@type'] === 'rdf:Property' &&
      node['schema:domainIncludes'] &&
      node['schema:domainIncludes']['@id'] === 'schema:Thing'
    );
    console.log('\nThing properties:');
    console.log(properties.map(p => ({
      id: p['@id'],
      label: p['rdfs:label'],
      comment: p['rdfs:comment'],
      range: p['schema:rangeIncludes']
    })));

    // Output overall schema structure
    console.log('\nSchema Structure Summary:');
    console.log('Total nodes:', data['@graph'].length);
    console.log('Classes:', data['@graph'].filter(n => n['@type'] === 'rdfs:Class').length);
    console.log('Properties:', data['@graph'].filter(n => n['@type'] === 'rdf:Property').length);

  } catch (error) {
    console.error('Error analyzing schema:', error);
    process.exit(1);
  }
}

analyzeSchema();
