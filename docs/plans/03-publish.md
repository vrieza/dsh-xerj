# 03 - Publish to GitHub

## Decisions
- Visibility: **private** (not specified by the owner; safest while the plugin is still being tested). Change with `gh repo edit --visibility public`.
- Account: `vrieza` (gh is logged in, SSH protocol).
- Branch: `main`. One commit.

## Steps
- [ ] Scan the tree for secrets (api keys, tokens) before the first commit.
- [ ] `git init -b main`.
- [ ] `git add -A` and review `git status`: no `node_modules`, no logs, no `.bak`.
- [ ] Commit: `feat: dsh-xerj plugin (managed XERJ node, indexing, sidebar, settings)`.
- [ ] `gh repo create vrieza/dsh-xerj --private --source . --remote origin --push`.
- [ ] Verify: `gh repo view vrieza/dsh-xerj`, `git ls-remote origin`, and that `node_modules` is not in the pushed tree.

## Done when
- The remote `main` has the same commit hash as local `main`.
- The pushed tree has `AGENTS.md`, `docs/`, `lib/`, `client/` and no `node_modules`.

## Not done here
- No npm publish, no release tag, no CI. Add later if wanted.
