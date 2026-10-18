# Lessons learned

Mistakes made while building this plugin, so they do not repeat. Each entry: what happened, why, and the check that would have caught it.

## 1. Said "should work" without running the real thing (4 times)
- **What:** After each change I told the user it would work. It did not, four times in a row.
- **Why:** I verified with unit tests that mock `ctx`, and never called `apply()` or checked the live server.
- **Check:** `test/apply.test.js` plus the `/dsh-xerj/status` curl in [AGENTS.md](../AGENTS.md). If the UI was not seen, say "not verified in the browser".

## 2. Stopped at the first bug, there were three
- **What:** A syntax error in `lib/prompt.js` (nested backticks) was found and fixed. I declared the cause found. Two more startup crashes remained.
- **Why:** I fixed what the error pointed at but did not boot the whole plugin afterwards.
- **Check:** After every fix, re-run the full boot (`apply()` from `$HOME`) and keep going until it is clean.

## 3. Config check depended on the folder dsh started from
- **What:** `validateConfig` threw "dataDir must not be inside workspace" using `process.cwd()`. dsh starts from `$HOME`, and `~/.dsh/xerj/data` is inside it, so the plugin crashed on every boot.
- **Why:** I treated the dsh start folder as "the workspace". There is no single workspace; each conversation has its own folder.
- **Check:** Never use `process.cwd()` for project logic. The data-dir rule moved to index time (`assertDataDirOutside`), against the project being indexed.

## 4. Tool output schemas rejected by defineTool
- **What:** `schema: { type: 'object' }` and `{ type: 'array' }` made `defineTool` throw, which killed the whole plugin.
- **Why:** The schema compiler requires explicit `additionalProperties` or the `json` type. I never ran `defineTool` outside dsh.
- **Check:** `apply()` test registers all tools.

## 5. A UI that hid a dead backend
- **What:** The panel showed `dsh-project` and `localhost:9200` while no backend existed. The user saw a "working" panel with fake data.
- **Why:** I wrote fallbacks (`status?.prefix || 'dsh-project'`) so the component never looked empty.
- **Check:** No placeholder data. If the request fails, show "XERJ plugin unreachable" with the error.

## 6. Debugged the UI before checking the server
- **What:** I reworked the client twice while the host routes returned 404 (plugin not loaded).
- **Why:** A 404 on `/dsh-xerj/*` was already in the first probe and I did not act on it.
- **Check:** Status curl first. 404 means startup failure, not a UI problem.

## 7. Used a port that was already taken
- **What:** The default node port 9280 plus the REST/gRPC offsets (P+1, P+2) were chosen without checking. Plain `xerj` also grabs 8080, which Docker holds here.
- **Why:** I assumed ports were free.
- **Check:** `lsof -nP -iTCP -sTCP:LISTEN` before picking ports. Default is now `9200` (what `xerj mcp` and `xerj init` already assume).

## 8. Treated a hanging index as a mystery
- **What:** `autoindex` stuck at "graph 100%" for minutes. I spent several runs changing flags (`--no-graph`, stdin, piping) before reading the node log.
- **Why:** I tested the CLI instead of reading the engine's own warning: "disk flood-stage watermark crossed ... used_pct=95".
- **Check:** On any hang, read the node log first (`~/.dsh/xerj/xerj-node.log`) and run `df -h`.

## 9. Unbounded commands and leftover processes
- **What:** A test blocked for minutes in the background; I called `timeout`, which does not exist on macOS; a throwaway node on port 9290 kept running.
- **Why:** I did not bound commands or track what I started.
- **Check:** Use a kill-after loop (or a job with a deadline), record pids, and run `ps -axo pid,command | grep xerj` before finishing.

## 10. Almost indexed the whole home folder
- **What:** An end-to-end test posted `path: $HOME` to the index route and an index run started on the whole home directory.
- **Why:** The route accepted any folder.
- **Check:** `assertDataDirOutside` now refuses `$HOME` and `/`.

## 11. Claimed features that do not exist
- **What:** The README and settings form describe "keep fresh" re-indexing. No code implements it.
- **Why:** Config and UI were written ahead of the feature and never reconciled.
- **Check:** For every README claim, grep for the code behind it. Unimplemented items are listed under "Known gaps" in [AGENTS.md](../AGENTS.md).

## 12. Links to my own machine inside the repo
- **What:** `node_modules/@deepseek-ai/*` are symlinks to files in `~/.dsh` and the global dsh install.
- **Why:** dsh-only packages are not installable from npm, so tests cannot import them otherwise.
- **Check:** They stay out of git (`.gitignore`) and are recreated with `npm run setup:links`.

## 13. Hand-written JS inside template strings
- **What:** Shell `${VAR:-x}` and nested backticks inside JS template strings caused parse errors (including the `prompt.js` crash).
- **Why:** I generated files through template literals without escaping.
- **Check:** Build such files with placeholders or arrays of lines, then run `node --check` / `bash -n` on the result.

## 14. Fixed the first startup crash, user restarted, plugin still dead
- **What:** After lesson 2-4 I told the user to restart. The plugin was still unreachable. Four more crashes were hiding behind the first ones: `ctx.logger` is a function, `ctx.skills` read without `inject`, a command `input` shaped `{ type }` instead of `{ hint }`, and `ctx.sessions` read on the route host (bare 400 on /status).
- **Why:** My `apply()` test used a lenient mock, so every wrong assumption about dsh's API passed. I again told the user it worked without booting dsh.
- **Check:** Boot a real second dsh (`dsh web --port 3199 --no-open`) and read its stdout. dsh prints startup errors only there. The unit test now throws on un-injected services like Cordis does, but the real boot is the proof.

## 15. Gave the system prompt data it cannot have
- **What:** The prompt section tried to read the session folder from its argument. dsh passes `{ scope, signal }`, so it silently used `process.cwd()` and put the wrong project prefix in every conversation.
- **Why:** I guessed the callback signature instead of reading `AssembleContext`.
- **Check:** Read the `.d.ts` of every dsh API before using it. The section is now generic.

## Debug order that works
0. Boot a real second dsh on another port and read its log (AGENTS.md, step 2). This finds startup crashes in one go.
1. Is the process new enough? (`ps -o lstart` vs. file mtimes)
2. Does the route answer? (`curl .../dsh-xerj/status`: 404 / 401 / 200)
3. Does `apply()` boot from `$HOME`? (`npm test`)
4. Is the engine up? (`curl 127.0.0.1:9200/_cluster/health`, then the node log, then `df -h`)
5. Only then look at the client bundle.
