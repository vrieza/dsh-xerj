# AGENTS.md - dsh-xerj

DSH (DeepSeek Harness) plugin that wires the XERJ search engine into dsh: managed engine, indexing, agent tools, a sidebar panel and a settings form.
Read [docs/LESSONS.md](docs/LESSONS.md) before changing anything: the plugin shipped broken several times because of mistakes listed there.

## Layout

| Path | Role |
|---|---|
| `lib/index.js` | Host entry: `name`, `inject`, `apply(ctx, config)`, re-exports `Config` |
| `lib/schema.js` | `Config` schema (schemastery). Required for the Settings "Configure" button |
| `lib/config.js` | `validateConfig`, `assertDataDirOutside`, `diskState` |
| `lib/workspace.js` | session cwd -> git root -> index prefix, setup state, known projects |
| `lib/node.js` | `NodeManager`: adopt or spawn the XERJ engine, pid/log files, `snapshot()` |
| `lib/runner.js`, `lib/autoindex.js`, `lib/cli.js` | Index runs: spawn `xerj autoindex`, parse `xerj-progress`/`xerj-done`, exit codes |
| `lib/routes.js` | HTTP routes under `/dsh-xerj/*` (config, status, node, index, cancel, setup, gain) |
| `lib/tools.js`, `lib/commands.js`, `lib/prompt.js` | Tools `xerj_status`/`xerj_autoindex`/`xerj_def`, `/xerj` command, system prompt and skill text |
| `client/client.js` | Browser bundle. **Hand-written, no build step.** Panel, tool cards, settings form |
| `cordis.patch.yml` | Mounts `xerj` (this plugin) and `mcp-xerj` (the official `xerj mcp` server) |
| `scripts/link-dsh-deps.sh` | Creates machine-local links so plain Node can import dsh-only packages |

## Commands

```bash
npm run setup:links   # once per clone: links schemastery, cosmokit, dsh-tools from your dsh install
npm test              # unit tests + apply() boot test
dsh --profile web --dump-config | grep -A8 "id: xerj"   # is it mounted?
```

## Before you say "it works" (do all of these)

1. `npm test` passes. `test/apply.test.js` boots `apply()` from `$HOME` against a strict Cordis-like context (throws on services missing from `inject`) and calls a route handler. Mocks still miss things, so also do step 2.
2. **Boot a real second dsh and read its output.** Startup errors are printed only there (not in `~/.dsh/logs`):
   ```bash
   (nohup dsh web --port 3199 --no-open > /tmp/dsh-probe.log 2>&1 & echo $! > /tmp/dsh-probe.pid); sleep 25
   grep -iE "warning|did not activate|Error|xerj \(" /tmp/dsh-probe.log      # must print nothing
   curl -s -w " [%{http_code}]" "http://127.0.0.1:3199/dsh-xerj/status?cwd=$PWD"   # must be 200
   kill $(cat /tmp/dsh-probe.pid); pkill -f "dsh web --port 3199"
   ```
   "dsh: warning: 1 entry did not activate" means the plugin crashed in `apply()`; the next line is the error. A 404 on `/dsh-xerj/*` means the same.
3. The user's dsh must be restarted after host-side edits (`ps -o lstart= -p $(lsof -t -iTCP:3080 -sTCP:LISTEN)`). Host code is not hot-reloaded. Client edits need a hard refresh.
4. If you could not check the browser UI, say so. Never write "should work now".

## DSH facts (verified on dsh 0.2.0-rc.2)

- Host plugin shape: `export name, inject, apply(ctx, config)` and `export { Config }`.
- `@deepseek-ai/*` packages resolve only inside dsh. The plugin is symlinked into the profile (`link:`), so Node resolves from the repo path and finds nothing. That is why `setup:links` exists. Do not add these as dependencies.
- `ctx.logger` is a callable service: `ctx.logger('xerj')`, not an object.
- Services missing from `inject` throw when read (`cannot get property "skills" without inject`). Read optional ones with `ctx.get('skills')`, `ctx.get('commands')`, `ctx.get('sessions')`. The `webServer` route host (`ctx.inject(['webServer'], host => ...)`) has no `sessions` either: use `host.get('sessions')`.
- `commands.register({ name, description, input: { hint: 'string' }, handler })`: `input` must be `{ hint }`, not `{ type }`. Handler gets `invocation.rawInput` and `invocation.agent`.
- `systemPrompt.section({ name, order, text })`: `text` is called with `{ scope, signal }`, **no agent**, so it cannot know the session folder. Keep it generic and let `xerj_status` report the prefix.
- A route handler that throws gives a bare `400` with an empty body (dsh-host-webserver). If a route returns 400 and no JSON, call the handler directly in node to see the exception.
- `defineTool` output schema must be `{ type: 'json' }` or an object with an explicit `additionalProperties`. `{ type: 'object' }` alone throws and kills the whole plugin at boot.
- Session folder, per context:
  - tools: `exec.agent.session.header.cwd`
  - commands: `invocation.agent.session.header.cwd` (input text is `invocation.rawInput`)
  - routes: `host.get('sessions')?.get(sessionId).header.cwd` (the route host has no `sessions` property)
  - panel: `props.scope.repoRoot || props.scope.cwd` (better-sidebar)
  - Never use `process.cwd()`. dsh is usually started from `$HOME`.
- Sidebar: with dsh-better-sidebar use `ctx.betterSidebar.registerTab({id,title,order,single,icon,component})`. Native sidebar needs two steps: `sidebarRightTabs.register` (the type) and the `sidebar.right.pane.tab` slot (the body).
- Settings page: DSH does not build forms. "Configure" appears only if the host exports `Config` AND the client registers `plugins.row.config` (key `dsh-xerj#xerj`) or `plugins.bundle.config` (key `dsh-xerj`).
- Register client slots synchronously inside `apply`. Anything after an `await`/`fetch` is too late.
- Routes: `ctx.inject(['webServer'], host => host.effect(() => mountRoutes(host.webServer, ...)))`. A duplicate path throws and fails the whole plugin.
- Sandbox `run_code` blocks: a shell `${VAR:-x}` inside a JS template literal is parsed as JS. Build such strings with a placeholder.

## XERJ facts (verified on xerj v1.0.0-rc.96)

- `xerj --insecure --data-dir D --port P`: ES API on P, native REST on P+1, gRPC on P+2. Without `--port` REST takes 8080 (Docker/qBittorrent often hold it).
- Health: `GET /_cluster/health`. Identity: `GET /` returns `cluster_name: "xerj"`. Console: `GET /_xerj-console/`.
- **At 95% disk use XERJ blocks all writes and `autoindex` hangs at "graph 100%" with no error.** Check `df` and the node log (`~/.dsh/xerj/xerj-node.log`) first. The plugin warns at 90% and refuses at 95%.
- `autoindex` exit codes: 0 ok, 3 ok-with-junk, 4 decision needed (JSON on stdout), 2 usage, 1 error.
- `xerj init` writes `.mcp.json`, `.claude/skills/xerj`, `AGENTS.md` into the project. Only run it when the user clicks the button.
- Indexing a git repo adds a graph phase that can stall on a full disk; use `--no-graph` only to isolate, not as a fix.

## Rules

- Never auto-approve a large index. Exit 4 goes to the user (Full / Fast / Skip).
- Never run `xerj feedback --open-pr` or the installer.
- Never index `$HOME` or `/` (guarded in `assertDataDirOutside`), and never index the engine's own data dir.
- Write into a user's project (`.agents/skills`, `xerj init`) only from an explicit button press.
- Stop only the engine this plugin started (`status === 'managed'`).
- No fake fallbacks in the UI. If the backend is unreachable, say so. Never show placeholder names or addresses.
- Always bound shell commands that can hang (macOS has no `timeout`), and kill every process you start.

## Known gaps

- `keepFresh` / `keepFreshDebounceMs` are config fields and UI toggles, but **nothing implements re-indexing after file changes**. Do not claim it works.
- Whether the tool cards receive an `openFile` prop in the chat is unverified; the click handler is a no-op without it.
- The sidebar panel and settings form were verified through the host API and a syntax check only. Nobody has seen them render in the browser yet.
- `locale/*.json` is not read by `client/client.js` (it has its own inline strings).
