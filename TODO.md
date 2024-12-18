# Project Status and Tasks

## Setup and Configuration ✅

- [x] Initialize package with TypeScript configuration
- [x] Set up Vitest for testing
- [x] Configure ESLint and Prettier
- [x] Set up basic project structure
- [x] Configure package.json with proper metadata

## Implementation

### Core Features ✅
- [x] YAML-LD frontmatter parsing
  - [x] Type-safe parsing with TypeScript
  - [x] Support for $ and @ property prefixes
  - [x] Special property extraction
- [x] AST parsing support
  - [x] Integration with remark plugins
  - [x] Separate entry point for AST functionality
- [x] Comprehensive test coverage
  - [x] Core parsing and stringification
  - [x] AST functionality
  - [x] Error handling

### Documentation 🚧
- [x] Update README with features and examples
- [ ] Complete API documentation
- [ ] Add examples directory
- [ ] Update CONTRIBUTING.md

### CI/CD 🚧
- [x] Set up GitHub Actions workflow
- [x] Configure semantic-release
- [x] Add test coverage reporting
- [x] Set up automated npm publishing
- [x] Fix package exports configuration

### Future Enhancements 🎯
- [ ] Simplify/reduce the embedded context size
- [ ] Add JSON-LD context validation
- [ ] Support for custom remark plugins
- [ ] Schema validation options
- [ ] Add changelog generation
- [ ] Add pull request template
- [ ] Add issue templates
