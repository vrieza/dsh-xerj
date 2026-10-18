/**
 * Generate XERJ system prompt section.
 */
export function buildSystemPromptSection() {
  const indexHint = '- Call xerj_status first: it reports whether this project is indexed and the exact index prefix. If it is not indexed and broad code retrieval is needed, ask the user before calling xerj_autoindex. When indexed, prefer mcp__xerj__xerj_search and xerj_def over recursive file grepping.';

  return [
    '# XERJ Search Integration',
    '- XERJ AI-native search engine is active for this workspace.',
    '- Each project has its own index prefix (dsh-<folder>-<hash>); xerj_status returns it.',
    indexHint,
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
    `   - Call \`xerj_status\` to verify cluster health and whether project indices matching \`${prefix}-*\` exist.`,
    '2. **Indexing**:',
    '   - If not indexed, call \`xerj_autoindex\` to make the workspace searchable.',
    '   - If an index estimate exceeds the time threshold, XERJ will request a decision. Ask the user whether to proceed, run fast (no embeddings), or cancel.',
    '3. **Searching Code**:',
    `   - Use \`mcp__xerj__xerj_search\` with query text and index \`${prefix}-*\`.`,
    '   - Use \`xerj_def\` with symbol names for instant go-to-definition.',
    '4. **Reference Corpora**:',
    '   - Use \`mcp__xerj__xerj_code_search\` to see how peer open-source repositories solved similar design challenges.'
  ].join('\n') + '\n';
}
