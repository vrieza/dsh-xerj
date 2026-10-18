import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { projectPrefix } from './prefix.js';

function git(cwd, args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

function fileHas(path, needle) {
  try { return readFileSync(path, 'utf8').includes(needle); } catch { return false; }
}

/**
 * Resolve the project a session works in: its cwd, the enclosing git repo
 * root (so sub-folders of one repo share one index), and the derived prefix.
 * @param {string} cwd
 * @param {{ prefix?: string }} [config]
 */
export function resolveWorkspace(cwd, config = {}) {
  const abs = resolve(cwd);
  const exists = isDir(abs);
  const top = exists ? git(abs, ['rev-parse', '--show-toplevel']) : '';
  const root = top || abs;
  const prefix = config.prefix && config.prefix !== 'auto' ? config.prefix : projectPrefix(root);
  return {
    cwd: abs,
    root,
    name: basename(root) || root,
    exists,
    isGit: Boolean(top),
    branch: top ? git(root, ['rev-parse', '--abbrev-ref', 'HEAD']) : null,
    prefix,
  };
}

/** Which XERJ wiring already exists inside the project. */
export function setupState(root) {
  return {
    mcpJson: fileHas(join(root, '.mcp.json'), '"xerj"'),
    agentsMd: fileHas(join(root, 'AGENTS.md'), 'xerj') || fileHas(join(root, 'AGENTS.md'), 'XERJ'),
    dshSkill: existsSync(join(root, '.agents', 'skills', 'xerj', 'SKILL.md')),
    claudeSkill: existsSync(join(root, '.claude', 'skills', 'xerj', 'SKILL.md')),
  };
}

/** The cwd recorded on a DSH session, if the store knows it. */
export function sessionCwd(sessions, sessionId) {
  if (!sessionId || !sessions?.get) return undefined;
  try { return sessions.get(sessionId)?.header?.cwd; } catch { return undefined; }
}

/** Distinct project roots across live DSH sessions, most recent first. */
export function knownWorkspaces(sessions, config) {
  const seen = new Map();
  let list = [];
  try { list = sessions?.list?.() ?? []; } catch {}
  const rows = list
    .map((s) => ({ cwd: s?.header?.cwd, at: s?.header?.createdAt ?? 0 }))
    .filter((r) => typeof r.cwd === 'string')
    .sort((a, b) => b.at - a.at);
  for (const row of rows) {
    const ws = resolveWorkspace(row.cwd, config);
    if (!ws.exists || seen.has(ws.root)) continue;
    seen.set(ws.root, { root: ws.root, name: ws.name, prefix: ws.prefix, isGit: ws.isGit });
    if (seen.size >= 25) break;
  }
  return [...seen.values()];
}
