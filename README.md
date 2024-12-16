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
