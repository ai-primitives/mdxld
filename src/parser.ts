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
  const match = mdx.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) {
    return { frontmatter: '', content: mdx }
  }
  return { frontmatter: match[1], content: match[2] }
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

export function parse(mdx: string, options?: ParseOptions): MDXLD {
  const { frontmatter, content } = extractFrontmatter(mdx)

  if (!frontmatter) {
    return { data: {}, content }
  }

  try {
    const yaml = parseYAML(frontmatter)
    if (typeof yaml !== 'object' || yaml === null) {
      throw new Error('Frontmatter must be an object')
    }
    const { special, data } = processFrontmatter(yaml as Record<string, unknown>, options)

    return {
      ...special,
      data,
      content,
    }
  } catch (error) {
    throw new Error(`Failed to parse YAML frontmatter: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function stringify(mdxld: MDXLD, options?: { useAtPrefix?: boolean }): string {
  const { data, content, ...special } = mdxld
  const prefix = options?.useAtPrefix ? '@' : '$'

  const frontmatter: Record<string, unknown> = {
    ...data,
  }

  for (const key of SPECIAL_PROPERTIES) {
    const specialKey = key as keyof Omit<MDXLD, 'data' | 'content'>
    const value = special[specialKey]
    if (value !== undefined) {
      frontmatter[`${prefix}${key}`] = value instanceof Set ? Array.from(value) : value
    }
  }

  const yamlString = stringifyYAML(frontmatter)
  return `---\n${yamlString}---\n${content}`
}
