/**
 * Build CLI arguments for `xerj autoindex <folder>`.
 */
export function buildAutoindexArgs({
  path,
  prefix,
  url,
  apiKey,
  maxMinutes = 10,
  approve,
  dryRun = false,
  fresh = false,
}) {
  const args = ['autoindex', path];
  if (url) args.push('--url', url);
  if (prefix) args.push('--prefix', prefix);
  if (typeof maxMinutes === 'number') args.push('--max-minutes', String(maxMinutes));
  if (approve) args.push('--approve', approve);
  if (dryRun) args.push('--dry-run');
  if (fresh) args.push('--fresh');
  if (apiKey) args.push('--api-key', apiKey);
  return args;
}

/**
 * Parse xerj-progress line.
 * Example: "xerj-progress phase=indexing pct=45.2 eta=12s"
 */
export function parseProgressLine(line) {
  if (!line || !line.startsWith('xerj-progress')) return null;
  const parts = line.split(/\s+/).slice(1);
  const out = {};
  for (const part of parts) {
    const [k, v] = part.split('=');
    if (!k || v === undefined) continue;
    if (k === 'pct') {
      const num = parseFloat(v);
      out.pct = Number.isNaN(num) ? null : num;
    } else if (k === 'eta') {
      out.eta = v === 'unknown' ? null : v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Parse xerj-done line.
 * Example: "xerj-done ok=true exit=0 reason=completed wall=12.4s datasets=4 records=1240 junk=0 datasets_refused=0"
 */
export function parseDoneLine(line) {
  if (!line || !line.startsWith('xerj-done')) return null;
  const parts = line.split(/\s+/).slice(1);
  const out = {};
  for (const part of parts) {
    const [k, v] = part.split('=');
    if (!k || v === undefined) continue;
    if (k === 'ok') out.ok = v === 'true';
    else if (k === 'exit') out.exit = parseInt(v, 10);
    else if (['datasets', 'records', 'junk', 'datasets_refused', 'code_files', 'code_files_indexed'].includes(k)) {
      out[k] = parseInt(v, 10);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Extract human error message from stderr/stdout.
 */
function extractError(text = '') {
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('error:') || trimmed.startsWith('fatal:')) {
      return trimmed;
    }
  }
  return lines.find(l => l.trim().length > 0) || 'Unknown error';
}

/**
 * Attempt to parse a JSON decision payload from xerj exit=4 stdout.
 */
export function parseDecisionJson(stdout = '') {
  try {
    const trimmed = stdout.trim();
    const openIdx = trimmed.indexOf('{');
    const closeIdx = trimmed.lastIndexOf('}');
    if (openIdx !== -1 && closeIdx !== -1 && closeIdx > openIdx) {
      const jsonStr = trimmed.slice(openIdx, closeIdx + 1);
      return JSON.parse(jsonStr);
    }
  } catch {}
  return null;
}

/**
 * Classify autoindex process exit outcome.
 */
export function classifyExit(exitCode, stdout = '', stderr = '') {
  if (exitCode === 0) {
    return {
      status: 'done',
      exitCode: 0,
      summary: parseDoneLine(stdout.split('\n').find(l => l.startsWith('xerj-done'))) || { ok: true, exit: 0 }
    };
  }

  if (exitCode === 3) {
    return {
      status: 'done',
      exitCode: 3,
      junk: true,
      reason: 'completed-with-junk',
      summary: parseDoneLine(stdout.split('\n').find(l => l.startsWith('xerj-done'))) || { ok: true, exit: 3 }
    };
  }

  if (exitCode === 4) {
    const decision = parseDecisionJson(stdout);
    return {
      status: 'needs-decision',
      exitCode: 4,
      decision: decision || { message: 'XERJ indexing requires approval to proceed with large dataset.' },
      prompt: 'Index estimate exceeded threshold. Ask user whether to proceed, run fast (no embeddings), or cancel.'
    };
  }

  return {
    status: 'failed',
    exitCode,
    error: extractError(stderr || stdout)
  };
}
