// Public surface of the generated Lexicon bindings.
//
// The files under `./generated` are produced by `pnpm lex:build` (the `lex`
// CLI from `@atproto/lex`, invoked with `--lexicons ../../lexicons --out
// src/generated --index-file`). They are git-ignored and rebuilt on install/CI,
// so this barrel is the only hand-written entry point. `--index-file` emits
// `src/generated/index.ts`, which is what we re-export below.
export * from './collections.js'
export * from './event-record.js'
export * from './generated/index.js'
