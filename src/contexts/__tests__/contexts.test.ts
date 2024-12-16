import { expect, test } from 'vitest'
import schemaOrg from './build/schema.org'
import epcisContext from './build/epcis-context'
import epcisOntology from './build/epcis-ontology'

test('contexts can be imported and accessed', () => {
  // Test schema.org context
  expect(schemaOrg).toBeDefined()
  expect(schemaOrg.$vocab).toBe('http://schema.org/')

  // Test EPCIS context
  expect(epcisContext).toBeDefined()
  expect(epcisContext.$vocab).toBe('https://ref.gs1.org/epcis/')

  // Test EPCIS ontology
  expect(epcisOntology).toBeDefined()
  expect(typeof epcisOntology).toBe('object')
})

test('$ prefixes are used instead of @ prefixes', () => {
  // Check schema.org context
  expect(schemaOrg.$vocab).toBeDefined()
  expect(schemaOrg['@vocab']).toBeUndefined()

  // Check EPCIS context
  expect(epcisContext.$vocab).toBeDefined()
  expect(epcisContext['@vocab']).toBeUndefined()
})
