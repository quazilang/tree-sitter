# tree-sitter-quazi

Tree-sitter grammar for the Quazi programming language. The canonical compiler
and contained language server live in the sibling `quazistrap` repository.

## Development

```bash
npm ci
XDG_CACHE_HOME=/tmp npm test
```

The grammar source is `grammar.js`; run `npm run build` after grammar changes
to regenerate `src/parser.c` and the node binding. Corpus fixtures belong in
`test/corpus/`, and editor queries belong in `queries/`.

From the full quazilang workspace checkout, verify that the grammar accepts
every maintained example and standard-library source with:

```bash
npm run test:workspace-conformance
```

This is deliberately separate from `npm test`, so a standalone grammar clone
does not need the compiler and standard-library sibling repositories.

The grammar preserves opaque postfix attributes on struct and union fields,
such as `name: String @ini("username")`. It recognizes the syntax and
arguments without assigning an INI/JSON/etc. meaning, matching the canonical
[attribute contract](../quazistrap/docs/LANGUAGE.md#attributes).
