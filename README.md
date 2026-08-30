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
