import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { statfsSync, mkdirSync } from 'node:fs';

/**
 * Expand '~' to user's home directory.
 */
function expandHome(p) {
  if (typeof p !== 'string') return p;
  if (p === '~' || p.startsWith('~/')) {
    return resolve(homedir(), p.slice(2));
  }
  return resolve(p);
}

/**
 * Validate and normalize dsh-xerj configuration.
 * @param {Record<string, unknown>} [raw]
 * @param {string} [workspaceRoot]
 */
export function validateConfig(raw = {}) {
  const cfg = { ...raw };
  const binary = typeof cfg.binary === 'string' && cfg.binary.trim() ? cfg.binary.trim() : 'auto';
  const url = typeof cfg.url === 'string' && cfg.url.trim() ? cfg.url.trim().replace(/\/+$/, '') : 'http://127.0.0.1:9200';
  const apiKey = typeof cfg.apiKey === 'string' ? cfg.apiKey : (process.env.XERJ_API_KEY || '');
  const manageNode = cfg.manageNode !== false;
  const urlPort = (() => { try { return Number(new URL(url).port) || 9200; } catch { return 9200; } })();
  const managedPort = Number.isInteger(cfg.managedPort) && cfg.managedPort > 0 ? cfg.managedPort : urlPort;
  
  const rawDataDir = typeof cfg.dataDir === 'string' && cfg.dataDir.trim() ? cfg.dataDir.trim() : '~/.dsh/xerj/data';
  const dataDir = expandHome(rawDataDir);

  const insecure = cfg.insecure !== false;
  const stopOnDispose = cfg.stopOnDispose !== false;
  const keepFresh = cfg.keepFresh !== false;
  const keepFreshDebounceMs = Number.isInteger(cfg.keepFreshDebounceMs) && cfg.keepFreshDebounceMs >= 1000
    ? cfg.keepFreshDebounceMs
    : 20000;
  const prefix = typeof cfg.prefix === 'string' && cfg.prefix.trim() ? cfg.prefix.trim() : 'auto';
  const maxMinutes = Number.isInteger(cfg.maxMinutes) && cfg.maxMinutes >= 0 ? cfg.maxMinutes : 10;
  const promptSection = cfg.promptSection !== false;

  const rawUi = (typeof cfg.ui === 'object' && cfg.ui !== null) ? cfg.ui : {};
  const ui = {
    toolCards: rawUi.toolCards !== false,
    sidebarPanel: rawUi.sidebarPanel !== false,
    consoleTab: rawUi.consoleTab !== false,
  };

  return {
    binary,
    url,
    apiKey,
    manageNode,
    managedPort,
    dataDir,
    insecure,
    stopOnDispose,
    keepFresh,
    keepFreshDebounceMs,
    prefix,
    maxMinutes,
    promptSection,
    ui,
  };
}

/**
 * Refuse to index a folder that contains the node's own data directory
 * (indexing it would feed the engine its own storage).
 * @param {string} dataDir
 * @param {string} target
 */
export function assertDataDirOutside(dataDir, target) {
  const absTarget = resolve(target);
  if (absTarget === '/' || absTarget === resolve(homedir())) {
    throw new Error(`Refusing to index "${absTarget}": that is your whole ${absTarget === '/' ? 'disk' : 'home folder'}. Open a project folder instead.`);
  }
  const absData = resolve(dataDir);
  if (absData === absTarget || absData.startsWith(absTarget + '/')) {
    throw new Error(`Refusing to index "${absTarget}": it contains the XERJ data directory "${absData}". Pick a project folder instead.`);
  }
}

/**
 * Disk usage of the volume holding dataDir. XERJ blocks writes at 95% used
 * (flood-stage watermark), which makes indexing hang without an error.
 * @returns {{ usedPct: number, freeGb: number, blocked: boolean, warn: boolean } | null}
 */
export function diskState(dataDir) {
  try {
    mkdirSync(dataDir, { recursive: true });
    const s = statfsSync(dataDir);
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    const usedPct = Math.round((1 - free / total) * 1000) / 10;
    return { usedPct, freeGb: Math.round(free / 1e8) / 10, blocked: usedPct >= 95, warn: usedPct >= 90 };
  } catch {
    return null;
  }
}
