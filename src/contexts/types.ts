export interface Context {
  [key: string]: unknown
  $type?: string
  $context?: string | Record<string, unknown>
  $id?: string
  $base?: string
  $vocab?: string
  $version?: string
}
