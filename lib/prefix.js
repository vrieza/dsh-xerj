import { createHash } from 'node:crypto';
import { resolve, basename } from 'node:path';

/**
 * Generate a safe, deterministic Elasticsearch/XERJ index prefix for a workspace.
 * Format: dsh-<slug>-<6-char-hash>
 * @param {string} cwd
 * @returns {string}
 */
export function projectPrefix(cwd = process.cwd()) {
  const absPath = resolve(cwd);
  const base = basename(absPath) || 'root';
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20) || 'proj';
  const hash = createHash('sha256').update(absPath).digest('hex').slice(0, 6);
  return `dsh-${slug}-${hash}`;
}
