# Diagnosis: why agents in other repos don't use XERJ

**Date:** 2026-10-20
**Input:** `XERJ_STATUS_AND_AGENT_ADOPTION_FINDINGS.md` (written from `/Users/vrieza/Repo/mii-bsim-migration`, 2026-10-19)
**Method:** I re-ran each claim against the live engine (`http://127.0.0.1:9200`, xerj `v1.0.0-rc.96`, ES-compat version `8.13.0`), the user's running dsh (port 3080, started 2026-10-19 14:59), and the plugin source at commit `45cdffe`. I changed no code.

## Verdict per claim

| # | Claim in the report | Verdict | Evidence |
|---|---|---|---|
| — | Workspace indexed: 8 indices, 1,260 docs, 225 files | **Confirmed** | `_cat/indices/dsh-mii-bsim-migration-64b9e6-*` → 8 indices, 1,260 docs. Catalog `run:run-20261018T090538Z-6997-0000`: `files_indexed: 225`, `records_total: 1260`, `wall_seconds: 14.6`. |
| 1 | MCP `xerj_search` defaults to `ax-*` and returns 0 hits with no error | **Confirmed. Main cause.** | `_cat/indices/ax-*` → `[]`. `POST /ax-*/_search` → `200`, `hits.total.value: 0`, `failed: 0`. No error tells the agent the pattern matched no index. The tool's own description says "Defaults to `ax-*` … so the common case needs no argument". |
| 2 | `xerj_status` shows `lastIndexed: null` after a restart | **Confirmed** | `lib/runner.js:15` keeps `lastSummaries` in a `Map`; it is filled only at `lib/runner.js:124` when a run finishes in this process. `lib/tools.js:41` reads only that map. The catalog already holds the durable summary (`autoindex-catalog`, `doc_kind: run`, field `prefix`), and the plugin never reads it. |
| 2b | `activeRun: { status: "failed" }` | **Plausible, not reproduced.** Real bug either way. | `runner.getRun()` (`lib/runner.js:19`) returns the last run for the prefix whatever its status, and `lib/tools.js:43` labels it `activeRun`. A finished or failed run stays "active" until the process restarts. I could not reproduce the specific failed run `run-1792406789591-lm76`: it lived only in the memory of an earlier process. |
| 3 | `AGENTS.md` sends agents to CLI commands that fail | **Confirmed** | From `/tmp`: `xerj search "intake pipeline"` → `no match in ax-* for: intake pipeline`, **exit code 0**. `xerj def intake` → `no definition in ax-* for: intake`. With `--prefix dsh-mii-bsim-migration-64b9e6` both return `test_engine.py:20`, `pipeline.py:27`. `xerj search --help`: `--prefix <P> … (default "ax")`. The CLI has no prefix env var. |
| 4 | System prompt makes grep/glob the reflex | **Hypothesis, not testable here.** Plausible. | The general rules ("Use the grep tool…") come from dsh, not the plugin. Can't measure agent choice from one session. |
| 5 | Prefix is auto-injected in native `xerj_def` but not in MCP `xerj_search` | **Confirmed** | `lib/tools.js:149` passes `--prefix <workspace prefix>` to `xerj def`. The MCP server (`cordis.patch.yml`, `xerj mcp`) has only `--url`/`--auth` options. `xerj mcp --help` lists no default-prefix option. |

### Corrections to the report

- "XERJ v8.13.0" is the Elasticsearch compatibility version. The binary is `xerj v1.0.0-rc.96`.
- "indexed … in 14.6s during run `run-20261018T090538Z-6997-0000`": that run catalog doc shows `files_submitted_this_run: 0`. The latest run was a no-op re-check and the data comes from an earlier run. The data is still correct.
- The report omits one more cause (6, below).

## Additional finding

**Cause 6: the plugin's system prompt doesn't say "pass `index`".** `lib/prompt.js:5` says "prefer `mcp__xerj__xerj_search` and `xerj_def`" but never says the MCP tool needs `index: "<prefix>-*"`. Only the skill text (`lib/prompt.js:39`) says it, and agents read the skill only if they load it. An agent that follows only the system prompt hits cause 1.

**Cause 7: `xerj_status` has no `indexed` flag.** The HTTP route has one (`lib/routes.js:134`, `indexed: indices.length > 0`). For the other repo it returns `"indexed": true, "docs": 1260`. The agent tool returns only `indicesCount`, next to `lastIndexed: null` and possibly `activeRun.status: "failed"`. That combination reads as "not indexed / broken" even when `indicesCount` is 8.

## Root cause, ranked

1. **The prefix contract leaks out to the agent (causes 1, 3, 5, 6).** The plugin picks a per-project prefix (`dsh-<folder>-<hash>`). Every surface except `xerj_def` expects the agent to carry it by hand: the MCP tools, the CLI, `AGENTS.md`, and the system prompt. Their default (`ax`) matches nothing and fails silently: 0 hits, exit 0. Prediction: an agent given a search tool that injects the prefix gets hits on its first try. I tested this by hand: same query, with prefix, returns 97 hits.
2. **`xerj_status` reports process memory, not index state (causes 2, 2b, 7).** Prediction: if status read `autoindex-catalog` (`doc_kind: run`, `prefix: <prefix>`, newest `summary_generated_at`) and reported `activeRun` only while `status === 'running'`, it would show the other repo as indexed after any restart.
3. **Reflex competition with grep (cause 4).** Secondary. Fixing 1 and 2 removes the extra steps that make grep the easy path. Measure only after those are fixed.

## Fixes (not applied; listed by impact)

1. **Native `xerj_search` tool** in `lib/tools.js`. Resolve the prefix like `xerj_def`, then run `xerj search <q> --prefix <p> --json` or POST `/<prefix>-*/_search` with the definition-first string query. Point the system prompt at it instead of `mcp__xerj__xerj_search`. When 0 indices match the prefix, return an explicit `not_indexed` error, never an empty hit list.
2. **`xerj_status`**: add `indexed: indicesCount > 0`. Fall back to the newest catalog `run` doc for `lastIndexed`/`lastSummary` when the in-memory map is empty. Return `activeRun` only while it is running, and put finished runs under `lastRun`.
3. **`lib/prompt.js:5`**: if the MCP search stays the recommended path, say "always pass `index: '<prefix>-*'` (from `xerj_status`); omitting it searches `ax-*` and returns 0 hits".
4. **The `AGENTS.md` snippet** (written by `xerj init`, outside this plugin) in `mii-bsim-migration` and other repos: add the `--prefix` the plugin uses, or point to the native tools. This edits a user project, so do it only on request (AGENTS.md rule).
5. Upstream XERJ, optional: a `XERJ_PREFIX` env var for `xerj mcp`/CLI defaults, and a warning or non-zero exit when the index pattern matches no index.

## Regression seams

- Fixes 1 and 2 have a clean seam: `test/` can mock `fetch`/`runXerj` and assert (a) status with an empty runner map plus a catalog doc reports `indexed: true` and a non-null `lastIndexed`, (b) a finished run is not reported as `activeRun`, (c) the search tool always passes `--prefix`.
- Cause 1 itself (MCP default `ax-*`) has no seam in this repo. It is upstream behaviour, and the fix is to route agents away from it.
- Cause 4 needs an agent-behaviour eval (same task, count XERJ vs grep calls). This repo has none.

## Also noticed

- This repo (`dsh-xerj`, prefix `dsh-dsh-xerj-c2361d`) has 0 indices, so `xerj_status` here correctly reports nothing.
- Engine disk use is 86.3%, below the plugin's 90% warn level. Worth watching (AGENTS.md: writes block at 95%).
