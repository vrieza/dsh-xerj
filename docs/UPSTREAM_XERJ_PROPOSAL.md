# Upstream RFC: Support `XERJ_PREFIX` Environment Variable and Fail-Fast on Empty Index Patterns

- **Target Project:** XERJ Search Engine (`xerj-org/xerj`)
- **Observed Upstream Version:** `xerj v1.0.0-rc.96` (Elasticsearch compatibility layer `8.13.0`)
- **Author:** DSH Integration Team (`dsh-xerj`)
- **Status:** Draft Proposal (Internal Documentation — do not file upstream automatically)
- **Originating Evidence:** `docs/XERJ_ADOPTION_DIAGNOSIS.md` (Finding #5, Claims 1, 3, 5)

---

## 1. Executive Summary

When integrating XERJ into developer environments and agentic platforms (such as DeepSeek Harness / DSH), two major upstream friction points prevent automated tooling and AI agents from effectively using XERJ:

1. **Lack of `XERJ_PREFIX` environment variable support:**
   In multi-project or workspace-isolated environments, indices are scoped with distinct prefixes (e.g., `dsh-<workspace>-<hash>-*`). While `xerj autoindex`, `xerj search`, and `xerj def` support the `--prefix <P>` CLI option, they **do not read an environment variable** like `XERJ_PREFIX`. Furthermore, the stdio MCP server (`xerj mcp`) provides **neither a `--prefix` CLI argument nor environment variable awareness**, causing all MCP search tools (`xerj_search`, `xerj_plan`, `xerj_map`) to hardcode an `ax-*` default pattern.
2. **Silent zero-hit success on non-existent index patterns:**
   When an index pattern matches zero indices on a XERJ node (for example, querying `ax-*` when indices exist under custom prefixes, or querying an unindexed repository):
   - The REST endpoint `POST /<pattern>/_search` returns HTTP `200 OK` with `hits: []` and `total: 0`.
   - The CLI (`xerj search "<query>"`) prints `no match in <pattern> for: <query>` and **exits with code 0**.
   - The MCP tool (`xerj_search`) returns an empty hits object with **no warning or error**.

**The Impact on AI Agents:**
AI agents interpret 0 hits with exit code 0 as a conclusive negative result ("the symbol or concept does not exist in this codebase") rather than a configuration or indexing omission ("the target index was not found"). Agents consequently abandon XERJ and regress to recursive disk grepping (`grep` / `glob`), defeating the search engine's purpose.

This proposal specifies:
1. Adding support for `XERJ_PREFIX` across `xerj search`, `xerj def`, `xerj autoindex`, and `xerj mcp`.
2. Emitting a clear warning and non-zero exit code in the CLI (and a structured error in MCP) when an index pattern matches zero indices, distinguishing "no matching documents" from "no matching index".

---

## 2. Empirical Evidence & Live Verification

All observations below were tested directly against `xerj v1.0.0-rc.96` and a live XERJ node running at `http://127.0.0.1:9200`.

### 2.1. CLI Options and Environment Variable Gap

Inspection of `xerj search --help` and `xerj def --help`:
```text
$ xerj search --help
OPTIONS:
    --url <U>       node endpoint (default $XERJ_URL or http://localhost:9200)
    --prefix <P>    index prefix to search (default "ax" — what `xerj autoindex` writes)
    --api-key <K>   Authorization (or $XERJ_API_KEY; --insecure nodes need none)
```

Inspection of `xerj mcp --help`:
```text
$ xerj mcp --help
OPTIONS:
    --url <URL>     Base URL of the XERJ ES-compatible listener.
                    Overrides XERJ_URL. Default: http://localhost:9200
    --auth <VALUE>  Authorization header sent verbatim on every proxied
                    request (e.g. 'ApiKey <token>'). Overrides XERJ_AUTH.

ENVIRONMENT:
    XERJ_URL        Same as --url
    XERJ_AUTH       Same as --auth
```

**Observation:**
- `--url` honors `$XERJ_URL`.
- `--api-key` honors `$XERJ_API_KEY`.
- `--auth` in `xerj mcp` honors `$XERJ_AUTH`.
- `--prefix` exists in `search`, `def`, and `autoindex`, but **only accepts an explicit CLI flag** and defaults unconditionally to `"ax"`. Setting `XERJ_PREFIX=custom xerj search ...` has no effect (it still searches `ax-*`).
- `xerj mcp` has **no `--prefix` option and no `XERJ_PREFIX` environment variable**.

### 2.2. Host Configuration Limitations (`cordis.patch.yml`)

In DSH, the MCP server is mounted declaratively via Cordis configuration:
```yaml
# cordis.patch.yml:19-28
    - id: mcp-xerj
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: xerj
        transport: stdio
        command: !!js "process.env.XERJ_BIN || 'xerj'"
        args: [mcp]
        env:
          XERJ_URL: http://127.0.0.1:9200
```
Because `xerj mcp` accepts only `XERJ_URL` and `XERJ_AUTH`, the host plugin cannot inject the workspace prefix (`dsh-<folder>-<hash>`) into the MCP server process.

As a consequence, the registered MCP tool schema for `xerj_search` declares:
```text
index: Index name or pattern to search. Defaults to ax-* — the prefix xerj autoindex writes — so the common case needs no argument. Pass an explicit name to search anything else.
```
When an agent calls `mcp__xerj__xerj_search(query="auth token")` without an explicit `index` parameter, the server routes the query to `POST /ax-*/_search`.

### 2.3. Silent Zero-Hit Behavior in CLI and REST

On a node containing 8 workspace indices under prefix `dsh-mii-bsim-migration-64b9e6-*` and 0 indices under `ax-*`:

1. **REST Search without `allow_no_indices`:**
   ```bash
   $ curl -s -X POST "http://127.0.0.1:9200/ax-*/_search" \
     -H "Content-Type: application/json" -d '{"query":{"match_all":{}}}'
   ```
   **Response:**
   ```json
   {
     "took": 0,
     "timed_out": false,
     "_shards": { "total": 1, "successful": 1, "skipped": 0, "failed": 0 },
     "hits": { "total": { "value": 0, "relation": "eq" }, "max_score": null, "hits": [] }
   }
   ```
   HTTP Status: `200 OK`. `_shards.failed` is 0.

2. **CLI Search on Missing Pattern:**
   ```bash
   $ xerj search "intake pipeline"
   no match in ax-* for: intake pipeline
   (looks like a symbol name — try: xerj def intake pipeline)
   (index a relevant repo first: xerj autoindex <folder>)
   $ echo "exit code: $?"
   0
   ```
   With `--json`:
   ```bash
   $ xerj search "intake pipeline" --json
   {
     "took": 0,
     "timed_out": false,
     "_shards": { "total": 1, "successful": 1, "skipped": 0, "failed": 0 },
     "hits": { "total": { "value": 0, "relation": "eq" }, "max_score": null, "hits": [] }
   }
   $ echo "exit code: $?"
   0
   ```

3. **REST Search with `allow_no_indices=false`:**
   ```bash
   $ curl -s -X POST "http://127.0.0.1:9200/ax-*/_search?allow_no_indices=false" \
     -H "Content-Type: application/json" -d '{"query":{"match_all":{}}}'
   ```
   **Response:**
   ```json
   {
     "error": {
       "root_cause": [
         {
           "type": "index_not_found_exception",
           "reason": "no such index [ax-*]",
           "index": "ax-*"
         }
       ],
       "type": "index_not_found_exception",
       "reason": "no such index [ax-*]",
       "index": "ax-*"
     },
     "status": 404
   }
   ```
   **Crucial Insight:** The XERJ engine already natively supports standard Elasticsearch `allow_no_indices=false` error reporting. However, neither `xerj search`, `xerj def`, nor `xerj mcp` utilizes this flag or validates index existence before reporting empty results.

---

## 3. Proposed Changes

### Proposal 1: Introduce `XERJ_PREFIX` Environment Variable

#### 1. Configuration Hierarchy
For all CLI commands (`xerj search`, `xerj def`, `xerj autoindex`) and the `xerj mcp` server:

$$\text{Prefix} = \text{CLI Option } (\texttt{--prefix}) \;\;>\;\; \text{Env Var } (\texttt{XERJ\_PREFIX}) \;\;>\;\; \text{Default } (\texttt{"ax"})$$

If `XERJ_PREFIX` is set and non-empty:
- `xerj search "<query>"` defaults to searching `<XERJ_PREFIX>-*`.
- `xerj def "<symbol>"` defaults to searching `<XERJ_PREFIX>-*`.
- `xerj autoindex <folder>` defaults to creating indices under `<XERJ_PREFIX>-*`.
- `xerj mcp` uses `<XERJ_PREFIX>` as the default prefix for all exposed tools.

#### 2. CLI Help Updates
Update `--help` output for `xerj search`, `xerj def`, `xerj autoindex`:
```text
--prefix <P>    index prefix (default $XERJ_PREFIX or "ax")
```

#### 3. MCP Server Enhancements (`xerj mcp`)
- Add CLI option `--prefix <P>` to `xerj mcp`.
- Add environment variable `XERJ_PREFIX` to `xerj mcp`.
- When `XERJ_PREFIX` (or `--prefix`) is provided:
  - Tool definitions (`xerj_search`, `xerj_plan`, `xerj_map`):
    - Parameter schema for `index`:
      `description: "Index name or pattern to search. Defaults to <XERJ_PREFIX>-* ..."`
  - Tool execution:
    - If `args.index` is omitted by the caller, substitute `<XERJ_PREFIX>-*` instead of `ax-*`.

---

### Proposal 2: Fail-Fast on Empty Index Patterns

Distinguish between two distinct runtime conditions:
1. **Empty Query Result:** Target indices exist, but no documents match the search criteria. (Valid search, 0 hits).
2. **Missing Index Target:** The index pattern resolved to 0 indices on the cluster. (Configuration/Targeting defect).

#### 1. Detection Mechanism
When executing a search in CLI or MCP:
- **Option A (REST Parameter):** Append `allow_no_indices=false` to the proxied search query (e.g. `POST /<pattern>/_search?allow_no_indices=false`). If the server returns HTTP 404 `index_not_found_exception`, the pattern matched zero indices.
- **Option B (Pre-flight Catalog / Cat API):** Check cluster metadata or `GET /_cat/indices/<pattern>` to verify matching index count $> 0$.

Option A is recommended as it requires zero additional network round-trips.

#### 2. Proposed CLI Behavior (`xerj search`, `xerj def`)
When the index pattern resolves to zero indices:
- **Human / Standard Mode:**
  - Print error message to `stderr`:
    ```text
    error: no indices match pattern 'ax-*' on http://localhost:9200
    hint: index this workspace with 'xerj autoindex <folder>' or specify --prefix / $XERJ_PREFIX
    ```
  - Exit code: **`exit 2`** (or non-zero index error code; must NOT be 0).
- **Machine Mode (`--json`):**
  - Print structured JSON error to `stdout` (or `stderr`):
    ```json
    {
      "error": "no_such_index_pattern",
      "pattern": "ax-*",
      "url": "http://localhost:9200",
      "message": "No indices match pattern 'ax-*'"
    }
    ```
  - Exit code: **non-zero**.
- **Opt-Out Flag (for legacy compatibility):**
  - Provide `--allow-no-indices` or `--ignore-empty-pattern` if a script explicitly requires exit 0 when no indices exist.

#### 3. Proposed MCP Server Behavior (`xerj mcp`)
When an MCP tool (`xerj_search`, `xerj_vector_search`, `xerj_semantic_search`, `xerj_hybrid_search`, `xerj_plan`, `xerj_map`) is invoked:
- If the resolved `index` pattern matches zero indices on the connected node:
  - Do NOT return a normal result with `hits: { total: { value: 0 } }`.
  - Return an **MCP Tool Error** (`isError: true` in the MCP protocol):
    ```json
    {
      "isError": true,
      "content": [
        {
          "type": "text",
          "text": "XERJ Error: No indices match pattern 'ax-*' on node http://localhost:9200. Check that the repository has been indexed via 'xerj autoindex <folder>' and verify your index prefix (current: 'ax', set XERJ_PREFIX or pass explicit 'index')."
        }
      ]
    }
    ```
- **Why this is critical for agents:**
  When an agent receives `isError: true`, the agent platform triggers its error-recovery branch instead of treating the query as answered. The agent can immediately alert the user to index the folder, call `xerj_status`, or supply the correct `index` parameter.

---

## 4. Acceptance Criteria

### A. Environment Variable `XERJ_PREFIX`
1. `XERJ_PREFIX=custom xerj search "test"` queries index pattern `custom-*` by default.
2. `XERJ_PREFIX=custom xerj search --prefix override "test"` honors `--prefix override`, querying `override-*`.
3. In `xerj mcp`, launching with `XERJ_PREFIX=dsh-proj-1234` causes:
   - Tool `xerj_search` schema description to display `Defaults to dsh-proj-1234-*`.
   - Tool call `xerj_search(query="foo")` without `index` to query `dsh-proj-1234-*`.
   - Explicit `xerj_search(index="other-*", query="foo")` to search `other-*`.

### B. Empty Index Pattern Fail-Fast
1. When index pattern `ax-*` matches 0 indices:
   - `xerj search "test"` prints an error explaining that no indices match `ax-*`, and exits with a non-zero code.
   - `xerj search "test" --json` returns a JSON object with error details and exits non-zero.
   - `mcp__xerj__xerj_search` returns `isError: true` with a clear explanation of the missing index pattern.
2. When index pattern `existing-*` matches 1 or more indices, but 0 documents match the query `"nonexistent_token_123"`:
   - `xerj search` prints `no match in existing-* for: nonexistent_token_123` and exits with code 0.
   - `xerj search --json` returns valid JSON with `hits.total.value: 0` and exits with code 0.
   - `mcp__xerj__xerj_search` returns normal hits with total value 0 and `isError: false`.

---

## 5. Backward Compatibility & Migration Notes

- **Default Unchanged When Unset:** If `XERJ_PREFIX` is not defined in the environment, the default prefix remains `"ax"`, preserving 100% compatibility for single-repo default users.
- **CLI Flag Precedence:** The `--prefix` CLI option continues to have the highest precedence, ensuring existing wrapper scripts or commands are unaffected.
- **Exit Code Change for Missing Indices:**
  - Changing CLI exit from 0 to non-zero when no index exists is technically a breaking change for scripts that relied on exit code 0 when searching against an uninitialized node.
  - Mitigation: The non-zero code only triggers when **zero indices match the pattern**, which represents an unindexed or misconfigured target state. Adding `--allow-no-indices` allows callers needing legacy behavior to opt in.
- **MCP Tool Error:**
  - Standard MCP clients and AI agent runtimes expect `isError: true` on target failures. This conforms directly to MCP specifications and standard agent error recovery protocols.

---

## 6. Verification Summary & Substantiation Record

| Claim / Item | Verification Status | Basis / Evidence |
|---|---|---|
| `xerj` binary version | **Verified** | `xerj --version` $\rightarrow$ `xerj v1.0.0-rc.96` (ES version `8.13.0`) |
| `xerj search` `--prefix` default `"ax"` | **Verified** | `xerj search --help` lines 7-8 |
| `xerj search` missing `XERJ_PREFIX` | **Verified** | `xerj search --help` documents `$XERJ_URL` and `$XERJ_API_KEY`, but no `$XERJ_PREFIX`. Verified by running `XERJ_PREFIX=... xerj search ...` |
| `xerj mcp` missing `--prefix` and `XERJ_PREFIX` | **Verified** | `xerj mcp --help` documents only `--url`/`XERJ_URL` and `--auth`/`XERJ_AUTH` |
| CLI exit 0 on empty pattern | **Verified** | Ran `xerj search --prefix non-existent-prefix "test"`, confirmed exit code 0 |
| REST API behavior on empty wildcard | **Verified** | `curl POST /ax-*/_search` returns 200 OK with `hits.total.value: 0` |
| REST API support for `allow_no_indices=false` | **Verified** | `curl POST /ax-*/_search?allow_no_indices=false` returns HTTP 404 `index_not_found_exception` |
| DSH Cordis mounting config | **Verified** | `cordis.patch.yml:19-28` shows `mcp-xerj` passing only `XERJ_URL` |
| DSH `xerj_def` prefix workaround | **Verified** | `lib/tools.js:149` shows manual injection `['def', ..., '--prefix', prefix]` |
| DSH `docs/XERJ_ADOPTION_DIAGNOSIS.md` | **Verified** | Section "Root cause, ranked" #1 and Fixes #5 in `docs/XERJ_ADOPTION_DIAGNOSIS.md` |
| Internal `xerj` C/Rust source implementation | **Unverified / Out of Scope** | `/Users/vrieza/.local/bin/xerj` is a compiled Mach-O arm64 binary; upstream source repository internals were not inspected directly. |
