import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

function isExecutable(filePath) {
  try {
    if (!existsSync(filePath)) return false;
    const stat = statSync(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Resolve the xerj executable binary path.
 * Checks:
 * 1. Explicit configuration option
 * 2. XERJ_BIN environment variable
 * 3. PATH search / standard install locations (~/.local/bin/xerj)
 * @param {string} [explicit]
 * @returns {string|null}
 */
export function resolveXerjBinary(explicit) {
  if (explicit && explicit !== 'auto') {
    const p = resolve(explicit);
    if (isExecutable(p)) return p;
    return null;
  }

  if (process.env.XERJ_BIN) {
    const envPath = resolve(process.env.XERJ_BIN);
    if (isExecutable(envPath)) return envPath;
  }

  // Check ~/.local/bin/xerj
  const localBin = resolve(homedir(), '.local/bin/xerj');
  if (isExecutable(localBin)) return localBin;

  // Check Windows typical path
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || resolve(homedir(), 'AppData', 'Local');
    const winBin = resolve(localAppData, 'Programs', 'xerj', 'xerj.exe');
    if (isExecutable(winBin)) return winBin;
  }

  // System path fallback (search in process.env.PATH)
  const paths = (process.env.PATH || '').split(process.platform === 'win32' ? ';' : ':');
  for (const dir of paths) {
    if (!dir) continue;
    const candidate = resolve(dir, process.platform === 'win32' ? 'xerj.exe' : 'xerj');
    if (isExecutable(candidate)) return candidate;
  }

  return null;
}
