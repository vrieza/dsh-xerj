---
name: xerj
description: AI-native code search, symbol go-to-definition, and reference coding with XERJ. Use when exploring codebases, answering questions about architecture, locating symbols or functions, or looking for reference implementations in peer projects.
---

# XERJ Code Search & Reference Coding

## Overview

Use XERJ to navigate, understand, and retrieve code across the current workspace and peer open-source corpora. XERJ replaces blind, token-heavy full-tree greps and recursive `read` calls with typed, indexed retrieval that points directly to `file:line` coordinates.

## When to Use

- **Locating Definitions & Implementations**: Finding where functions, classes, types, routes, or components are declared and defined.
- **Exploring Unfamiliar Codebases**: Understanding project architecture, data flows, and module interactions.
- **One-Shot Feature Implementation**: Before writing new code, retrieve existing project conventions and patterns in one turn.
- **Reference Coding**: Finding how battle-tested open-source projects solved the exact same problem instead of guessing.
- **Minimizing Context Consumption**: When grepping or file reading would flood the context window with hundreds of irrelevant lines.

## Core Workflows

### 1. Verification & Index Check

Before grepping or reading files, verify if the workspace is indexed:

```typescript
// Check cluster health and project index status
await tools.xerj_status({});
```

- If `indicesCount > 0` or `lastSummary` exists: the project is already indexed! Proceed directly to search.
- If not indexed: invoke `xerj_autoindex` to build the project index:
  ```typescript
  await tools.xerj_autoindex({ wait: true });
  ```
- **Handling Large Repositories (`needs-decision`)**:
  If XERJ estimates the index will take $>10$ minutes, `xerj_autoindex` returns `status: "needs-decision"`.
  - Prompt the user: *"The repository is large. Should I proceed with full indexing, fast indexing (skipping neural embeddings), or cancel?"*
  - Re-run with the chosen answer: `approve: "proceed" | "fast" | "cancel"`.

### 2. Finding Code & Symbols

#### Go-To-Definition (Exact & Typed)
When you know the symbol name, interface, or function:
```typescript
await tools.xerj_def({
  symbol: "handleCheckout",
  kind: "function",     // optional: "class", "interface", "method"
  lang: "typescript"    // optional
});
```
Returns exact `file`, `line`, and `signature`. Open only the matched file at that line.

#### Code & Semantic Search
When searching for functionality, concepts, or keywords:
```typescript
// Via MCP tools (using the project index prefix from xerj_status)
await tools.mcp__xerj__xerj_search({
  index: "dsh-<project>-*",
  query: "jwt authentication middleware refresh token",
  size: 5
});
```

#### Schema & Mapping Check
Before writing custom search queries or Elasticsearch DSL:
```typescript
await tools.mcp__xerj__xerj_map({
  index: "dsh-<project>-*"
});
```

### 3. Reference Coding (Peer Projects)

Before inventing new patterns, retrieve how existing high-quality open-source projects solved it:
```typescript
await tools.mcp__xerj__xerj_code_search({
  query: "debounced file watcher with abort signal",
  k: 5
});
```
This achieves up to 2.7× fewer tokens than cloning and grepping third-party source trees.

---

## Agentic Coding Constraints & Best Practices

1. **Search Before Grep**: Never run recursive `grep` or shell `find` across entire repositories without first checking if XERJ has an index.
2. **Never Blindly Read Directories**: Don't read whole directory trees into context when a single `xerj_def` or `xerj_search` can locate the exact 10 lines needed.
3. **Embeddings Default**: Remember XERJ defaults to lexical (BM25) search unless the node was started with `--embed-mode neural`. Use descriptive keywords alongside concepts for best recall.
4. **Safety Restrictions**:
   - **Never** execute `xerj feedback --open-pr` or automated PR generators without explicit human permission.
   - **Never** execute `xerj init` automatically, as it modifies project `.mcp.json` files.
