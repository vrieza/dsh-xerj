# dsh-xerj

> Seamless [XERJ](https://github.com/xerj-org/xerj) search engine integration for DeepSeek Harness (DSH).

`dsh-xerj` turns any project workspace into an instantly searchable, semantically queryable codebase with zero manual configuration. It bundles XERJ's official Model Context Protocol (MCP) server, a host-managed background index runner, and intuitive visual controls for the DSH Web UI.

---

## Features

- **Instant Code & Symbol Search**: Agents use `mcp__xerj__xerj_search` and `xerj_def` to pinpoint implementations, signatures, and definitions instead of recursive file grepping.
- **Reference Coding**: Leverage `mcp__xerj__xerj_code_search` to inspect how open-source peer projects solved the same architecture problems.
- **Host-Managed Index Runner**:
  - Indexing executes safely in a managed daemon on the host—not via raw model bash commands.
  - Deduped: Multiple agent turns or UI clicks share the same active index task.
  - Safe Decision Gate: Large repository estimates (>10 min) prompt for user confirmation with **[Proceed]**, **[Fast]**, or **[Cancel]**. Never silently auto-approved.
- **Interactive Visuals & GUI**:
  - **Custom Tool Cards**: Clickable `file:line` links with direct editor jump for search and definition results.
  - **Sidebar Panel**: a "XERJ" tab (better-sidebar or the native right sidebar) that detects the current conversation's project, shows engine state, indexes with progress and a Full/Fast/Skip prompt for big repos, installs the project skill, and previews or runs `xerj init`.
  - **Web Console**: Access XERJ's built-in web console directly inside DSH's sidebar browser tab.
- **Safety First**: Never runs `xerj init`, `xerj feedback --open-pr`, or external package installers without explicit human initiation.

---

## Installation

Inside your DSH profile (e.g. `web`):

```bash
# Local development link
dsh plugin --profile web add link:/path/to/dsh-xerj

# Or from npm (when published)
dsh plugin --profile web add dsh-xerj
```

---

## Configuration

Configure options in your profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: xerj
      name: dsh-xerj
      config:
        binary: auto                        # Path to xerj binary or auto-discovery
        url: http://127.0.0.1:9200          # XERJ endpoint
        manageNode: true                    # Automatically spawn local node if none running
        managedPort: 9200                   # Port for the engine this plugin starts (also uses +1, +2)
        dataDir: ~/.dsh/xerj/data           # Safe path outside workspace root
        insecure: true                      # Dev mode (loopback-only, no auth needed)
        stopOnDispose: true                 # Only stop nodes spawned by this plugin
        keepFresh: true                     # Not implemented yet (see Known gaps)
        keepFreshDebounceMs: 20000          # Not implemented yet
        ui:
          toolCards: true                   # Enable rich chat cards for search results
          sidebarPanel: true                # Enable right sidebar status panel
          consoleTab: true                  # Enable embedded web console in browser tab
```

---

## Slash Commands

| Command | Action |
|---|---|
| `/xerj status` | Display cluster health, workspace index prefix, and last indexed time. |
| `/xerj index` | Trigger a background indexing run for the active project. |
| `/xerj console` | Show direct link to XERJ Web Console. |

---

## Agent Tools

| Tool | Purpose |
|---|---|
| `xerj_status` | Inspect cluster connectivity, index name, and document counts. |
| `xerj_autoindex` | Trigger or confirm project indexing (supports `approve: "proceed"|"fast"|"cancel"`). |
| `xerj_def` | Look up symbol definitions by identifier, language, or kind. |
| `mcp__xerj__xerj_search` | Lexical & hybrid code search over project indices. |
| `mcp__xerj__xerj_code_search` | Query open-source peer repositories for reference coding. |
| `mcp__xerj__xerj_map` | Read schema mapping before building Elasticsearch query DSL. |

---

## Development

```bash
npm run setup:links   # link dsh-only packages from your local dsh install (needs dsh on PATH)
npm test
```

Read [AGENTS.md](AGENTS.md) and [docs/LESSONS.md](docs/LESSONS.md) first.

## Known gaps

- Keep-fresh re-indexing is not implemented; the setting does nothing yet.
- The sidebar panel and settings form have not been verified in a browser.
- XERJ stops accepting writes at 95% disk use; the panel warns at 90% and refuses to index at 95%.

## License

MIT
