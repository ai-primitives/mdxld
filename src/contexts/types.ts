export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export interface JsonLdContext {
  '@context'?: Record<string, JsonValue>
  '@vocab'?: string
  '@type'?: string
  '@id'?: string
  '@base'?: string
  '@container'?: string
  '@protected'?: boolean
  [key: string]: JsonValue | undefined
}

export type TransformedContext = {
  $context?: Record<string, JsonValue>
  $vocab?: string
  [key: string]: JsonValue | undefined
}
