# mdxld

[![npm version](https://badge.fury.io/js/mdxld.svg)](https://www.npmjs.com/package/mdxld)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A modern TypeScript package for Markdown & MDX parsing with integrated YAML-LD frontmatter support. Parse MDX documents with type-safe YAML-LD frontmatter and optional AST support.

## Features

- 🔒 Full YAML-LD support in frontmatter with type-safe parsing
- 🔄 Support for both @ and $ property prefixes ($ preferred)
- 🌳 Optional AST parsing with common remark plugins
- 🔗 Optional Linked Data $context / $type enrichment
- 📦 Separate entry points for core and AST functionality
- 🚀 Built with TypeScript for type safety

## Installation

```bash
pnpm add mdxld
```

## Usage

### Basic Usage

```typescript
import { parse, stringify } from 'mdxld'

const mdx = parse(`---
$type: 'https://mdx.org.ai/Document'
$context: 'https://schema.org'
title: 'My Document'
description: 'A sample document'
author: 'John Doe'
---

# Hello World
`)

console.log(mdx)
// Output:
// {
//   type: 'https://mdx.org.ai/Document',
//   context: 'https://schema.org',
//   data: {
//     title: 'My Document',
//     description: 'A sample document',
//     author: 'John Doe'
//   },
//   content: '# Hello World\n'
// }
```

### AST Support

For AST parsing with remark plugins:

```typescript
import { parse } from 'mdxld/ast'

const mdx = parse(`---
$type: 'https://mdx.org.ai/Document'
title: 'My Document'
---

# Hello World
`)

// Includes AST from remark parsing
console.log(mdx.ast)
```

### Type Definitions

```typescript
interface MDXLD {
  id?: string
  type?: string
  context?: string | Record<string, unknown>
  language?: string
  base?: string
  vocab?: string
  list?: unknown[]
  set?: Set<unknown>
  reverse?: boolean
  data: Record<string, unknown>
  content: string
}

// Options for parsing MDX documents
interface ParseOptions {
  ast?: boolean // Whether to parse content as AST
  allowAtPrefix?: boolean // Allow @ prefix (defaults to $)
}

// Options for stringifying MDX documents
interface StringifyOptions {
  useAtPrefix?: boolean // Use @ prefix instead of default $
}
```

### Special Properties

The following properties are treated specially when prefixed with `$` or `@`:

- `type`: Document type URI (extracted to root)
- `context`: JSON-LD context as string URI or object
- `id`: Optional document identifier
- `language`: Document language
- `base`: Base URI for relative URLs
- `vocab`: Vocabulary URI
- `list`: Array value (converts non-array to single-item array)
- `set`: Set value (converts array to Set)
- `reverse`: Boolean flag for reverse properties

Example with special properties:

```typescript
const mdx = parse(`---
$type: 'https://mdx.org.ai/Document'
$context:
  '@vocab': 'https://schema.org/'
  name: 'https://schema.org/name'
$id: 'doc123'
$set: ['item1', 'item2']
$list: 'single-item'
title: 'My Document'
---`)

console.log(mdx)
// Output:
// {
//   type: 'https://mdx.org.ai/Document',
//   context: {
//     '@vocab': 'https://schema.org/',
//     name: 'https://schema.org/name'
//   },
//   id: 'doc123',
//   set: Set(2) { 'item1', 'item2' },
//   list: ['single-item'],
//   data: {
//     title: 'My Document'
//   },
//   content: ''
// }
```

### Advanced Usage

#### Property Prefix Handling

The package supports both `$` and `@` prefixes for YAML-LD properties, with `$` being the preferred prefix:

```typescript
import { parse } from 'mdxld'

// Using $ prefix (preferred)
const mdx1 = parse(`---
$type: 'https://mdx.org.ai/Document'
$context: 'https://schema.org'
---`)

// Using quoted @ prefix
const mdx2 = parse(
  `---
'@type': 'https://mdx.org.ai/Document'
'@context': 'https://schema.org'
---`,
  { allowAtPrefix: true },
)
```

#### Error Handling

The package provides detailed error messages for invalid YAML frontmatter:

```typescript
try {
  const mdx = parse(`---
  invalid: yaml: content
  ---`)
} catch (error) {
  console.error(error.message) // "Failed to parse YAML frontmatter: ..."
}
```

#### AST Parsing with Plugins

The AST functionality includes support for MDX, GitHub Flavored Markdown, and frontmatter:

```typescript
import { parse } from 'mdxld/ast'

const mdx = parse(`---
$type: 'https://mdx.org.ai/Document'
---

# Hello {name}

<CustomComponent prop={value}>
  Some **bold** text
</CustomComponent>
`)

console.log(mdx.ast)
// Output: Full AST with MDX nodes and GFM support
```

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Build the package
pnpm build

# Format and lint
pnpm format
pnpm lint
```

## License

MIT © [AI Primitives](https://mdx.org.ai)

## Dependencies

This package uses the following key dependencies:

- yaml: YAML parsing and stringification
- remark-mdx: MDX parsing support
- remark-gfm: GitHub Flavored Markdown support
- remark-frontmatter: Frontmatter parsing
- unified: Unified text processing
