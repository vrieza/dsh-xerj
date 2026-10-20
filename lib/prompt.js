/**
 * Generate XERJ system prompt section.
 */
export function buildSystemPromptSection() {
  return [
    '# XERJ Search Integration',
    '- XERJ AI-native search engine is active for this workspace.',
    '- Each project has its own index prefix (dsh-<folder>-<hash>); xerj_status returns it.',
    '- Call xerj_status first: trust its `indexed` flag and check its `prefix`. If `indexed: false` and broad code retrieval is needed, ask the user before calling xerj_autoindex.',
    '- When indexed, prefer native `xerj_search` (natural language code search) and `xerj_def` (go-to-definition) over recursive file grepping (grep/glob) — both automatically resolve and inject the workspace prefix.',
    "- If using the raw MCP tool `mcp__xerj__xerj_search`, you MUST always pass `index: '<prefix>-*'` (using the exact prefix from xerj_status); omitting index searches ax-* and silently returns 0 hits.",
    '- Reference Coding: Call mcp__xerj__xerj_code_search to inspect how open-source peer projects implemented similar patterns.',
    '- Schema Mapping: Always invoke mcp__xerj__xerj_map before generating complex Elasticsearch query DSL.',
    '- Embeddings: Default mode is lexical BM25 unless a neural embedder is explicitly configured.',
    '- Safety: Do not run xerj feedback --open-pr or execute automated project-altering scripts without user consent.'
  ].join('\n') + '\n';
}

/**
 * Embedded XERJ skill markdown instructions.
 */
export function buildSkillContent(prefix) {
  return [
    '---',
    'name: xerj',
    'description: Use XERJ AI-native search engine for fast reference coding, symbol lookup, and semantic codebase retrieval.',
    '---',
    '',
    '# Using XERJ in DeepSeek Harness',
    '',
    'When working in this project, use XERJ to retrieve code and reference patterns rapidly:',
    '',
    '1. **Verify Index Status**:',
    `   - Call \`xerj_status\` first: check its \`indexed\` flag (boolean) and \`prefix\` (\`${prefix}\`). Trust the \`indexed\` flag over in-memory run status.`,
    '2. **Indexing**:',
    '   - If `indexed: false`, ask the user or call `xerj_autoindex` to make the workspace searchable.',
    '   - If an index estimate exceeds the time threshold, XERJ will request a decision. Ask the user whether to proceed, run fast (no embeddings), or cancel.',
    '3. **Searching Code**:',
    '   - Prefer native `xerj_search` for ranked passage retrieval and `xerj_def` for instant go-to-definition. Both automatically resolve and inject the workspace prefix, and return an explicit `not_indexed` error if the index is missing.',
    `   - If using the raw MCP tool \`mcp__xerj__xerj_search\`, you MUST explicitly pass \`index: '${prefix}-*'\`. Omitting \`index\` searches \`ax-*\` and silently returns 0 hits.`,
    '4. **Reference Corpora**:',
    '   - Use `mcp__xerj__xerj_code_search` to see how peer open-source repositories solved similar design challenges.'
  ].join('\n') + '\n';
}

/**
 * Corrected AGENTS.md XERJ section snippet with prefix awareness.
 */
export function buildAgentsMdSnippet(prefix) {
  return [
    '## XERJ (code search)',
    '',
    'This project uses XERJ for reference coding and code search.',
    'In DSH, prefer the native tools: `xerj_search` for ranked definition-first passages (auto-injects prefix), and `xerj_def` for go-to-definition.',
    `From the CLI or outside DSH, always pass \`--prefix ${prefix}\` (from xerj_status):`,
    `- \`xerj search "<query>" --prefix ${prefix}\``,
    `- \`xerj def "<symbol>" --prefix ${prefix}\``,
    '(Omitting `--prefix` defaults to `ax-*` which matches nothing in this project).',
    `Index a repo with \`xerj_autoindex\` (in DSH) or \`xerj autoindex <folder> --prefix ${prefix}\` (CLI). Cite file:line for anything you rely on.`
  ].join('\n');
}

/**
 * Idempotently rewrites or appends the ## XERJ section in an AGENTS.md string.
 * Preserves the file's line endings (CRLF files stay CRLF).
 */
export function updateAgentsMd(content, prefix) {
  const crlf = content.includes('\r\n');
  const text = crlf ? content.replace(/\r\n/g, '\n') : content;
  const snippet = buildAgentsMdSnippet(prefix);
  const regex = /(^|\n)##[ \t]+XERJ(?:[ \t]*\(code search\))?[ \t]*(?=\n|$)[^\n]*(?:\n[\s\S]*?)?(?=\n##?\s|$)/i;
  let updated;
  if (regex.test(text)) {
    updated = text.replace(regex, (_match, lead) => lead + snippet + '\n');
  } else {
    const trimmed = text.trimEnd();
    updated = trimmed ? trimmed + '\n\n' + snippet + '\n' : snippet + '\n';
  }
  return crlf ? updated.replace(/\n/g, '\r\n') : updated;
}
