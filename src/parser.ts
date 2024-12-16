import { parse as parseYAML, stringify as stringifyYAML } from 'yaml'
import type { MDXLD, ParseOptions, SpecialProperty } from './types'

const SPECIAL_PROPERTIES: SpecialProperty[] = [
  'type',
  'context',
  'id',
  'language',
  'base',
  'vocab',
  'list',
  'set',
  'reverse',
]

function extractFrontmatter(mdx: string): { frontmatter: string; content: string } {
  // Match frontmatter between --- delimiters with exact test format matching
  const match = mdx.match(/^---\n([\s\S]*?)---\n([\s\S]*)$/)

  // Handle no frontmatter case
  if (!match) {
    return { frontmatter: '', content: mdx }
  }

  const frontmatter = match[1].trim()
  const content = match[2]

  // Empty frontmatter is treated as no frontmatter
  if (!frontmatter) {
    return { frontmatter: '', content: mdx }
  }

  return { frontmatter, content }
}

function escapeAtPrefix(yaml: string): string {
  return yaml.replace(/^@/gm, '__AT__')
}

function unescapeAtPrefix(yaml: string): string {
  return yaml.replace(/__AT__/g, '@')
}

function processFrontmatter(yaml: Record<string, unknown>, options?: ParseOptions): {
  special: Partial<MDXLD>
  data: Record<string, unknown>
} {
  const special: Partial<MDXLD> = {}
  const data: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(yaml)) {
    const cleanKey = key.replace(/^[@$]/, '')
    if (
      (key.startsWith('$') || (options?.allowAtPrefix && key.startsWith('@'))) &&
      SPECIAL_PROPERTIES.includes(cleanKey as SpecialProperty)
    ) {
      if (cleanKey === 'set' && Array.isArray(value)) {
        special[cleanKey] = new Set(value)
      } else if (cleanKey === 'list' && !Array.isArray(value)) {
        special[cleanKey] = [value]
      } else {
        special[cleanKey as keyof Partial<MDXLD>] = value as any
      }
    } else {
      data[key] = value
    }
  }

  return { special, data }
}

export function parse(mdx: string, options: { allowAtPrefix?: boolean } = {}): MDXLD {
  const { frontmatter, content } = extractFrontmatter(mdx)

  if (!frontmatter) {
    return {
      data: {},
      content
    }
  }

  try {
    // Parse YAML frontmatter
    const unescapedYaml = options.allowAtPrefix ? frontmatter : escapeAtPrefix(frontmatter)
    const parsed = parseYAML(unescapedYaml)

    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Failed to parse YAML frontmatter')
    }

    // Process frontmatter and extract special properties
    const { special, data } = processFrontmatter(parsed, options)

    return {
      ...special,
      data,
      content
    }
  } catch (error) {
    throw new Error('Failed to parse YAML frontmatter')
  }
}

export function stringify(mdxld: MDXLD, options?: { useAtPrefix?: boolean }): string {
  const { data, content, ...special } = mdxld
  const prefix = options?.useAtPrefix ? '@' : '$'

  const orderedFrontmatter: Record<string, unknown> = {}

  for (const key of SPECIAL_PROPERTIES) {
    const specialKey = key as keyof Omit<MDXLD, 'data' | 'content'>
    const value = special[specialKey]
    if (value !== undefined) {
      orderedFrontmatter[`${prefix}${key}`] = value instanceof Set ? Array.from(value) : value
    }
  }

  Object.assign(orderedFrontmatter, data)

  const escapedFrontmatter = Object.fromEntries(
    Object.entries(orderedFrontmatter).map(([key, value]) => [escapeAtPrefix(key), value])
  )

  const yamlString = unescapeAtPrefix(stringifyYAML(escapedFrontmatter))
  return `---\n${yamlString}---\n${content}`
}
