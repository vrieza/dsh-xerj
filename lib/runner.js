import { EventEmitter } from 'node:events';
import { runXerj } from './cli.js';
import { buildAutoindexArgs, parseProgressLine, parseDoneLine, classifyExit } from './autoindex.js';

/**
 * Query autoindex-catalog for the newest run document for a prefix.
 */
export async function fetchCatalogSummary(url, prefix, { apiKey, signal } = {}) {
  try {
    const res = await fetch(`${url}/autoindex-catalog/_search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `ApiKey ${apiKey}` } : {})
      },
      body: JSON.stringify({
        query: {
          bool: {
            filter: [
              { term: { doc_kind: 'run' } },
              { term: { prefix } }
            ]
          }
        },
        sort: [{ summary_generated_at: 'desc' }],
        size: 1
      }),
      signal: signal || AbortSignal.timeout(3000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    const hit = data?.hits?.hits?.[0]?._source;
    if (!hit) return null;
    let indexedAt = null;
    if (hit.summary_generated_at) {
      const parsed = Date.parse(hit.summary_generated_at);
      if (!Number.isNaN(parsed)) indexedAt = parsed;
    }
    if (!indexedAt && hit.started) {
      const parsed = Date.parse(hit.started);
      if (!Number.isNaN(parsed)) indexedAt = parsed;
    }
    return {
      ...hit,
      indexedAt,
      records: hit.records_total ?? hit.records,
      files: hit.files_indexed ?? hit.files
    };
  } catch {
    return null;
  }
}

/**
 * IndexRunner coordinates active indexing runs across DSH agents, slash commands, and the Web UI.
 */
export class IndexRunner extends EventEmitter {
  constructor(logger = console) {
    super();
    this.logger = logger;
    /** @type {Map<string, object>} */
    this.runs = new Map();
    /** @type {Map<string, object>} */
    this.lastRuns = new Map();
    /** @type {Map<string, object>} */
    this.lastSummaries = new Map();
    this.activeProcesses = new Map();
  }

  getRun(prefix) {
    return this.runs.get(prefix) || null;
  }

  getActiveRun(prefix) {
    const run = this.runs.get(prefix);
    return (run && run.status === 'running') ? run : null;
  }

  getLastRun(prefix) {
    const last = this.lastRuns.get(prefix);
    if (last) return last;
    const run = this.runs.get(prefix);
    return (run && run.status !== 'running') ? run : null;
  }

  getLastSummary(prefix, options) {
    const cached = this.lastSummaries.get(prefix);
    if (cached) return cached;
    if (options && options.url) {
      return this.fetchLastSummary(prefix, options);
    }
    return null;
  }

  async fetchLastSummary(prefix, { url, apiKey, signal } = {}) {
    const cached = this.lastSummaries.get(prefix);
    if (cached) return cached;
    if (!url) return null;
    const summary = await fetchCatalogSummary(url, prefix, { apiKey, signal });
    if (summary) {
      this.lastSummaries.set(prefix, summary);
      return summary;
    }
    return null;
  }

  /**
   * Start or join an autoindex run for a project prefix.
   */
  async startRun({
    binary,
    path,
    prefix,
    url,
    apiKey,
    maxMinutes = 10,
    approve,
    dryRun = false,
    fresh = false,
    source = 'unknown'
  }) {
    const existing = this.runs.get(prefix);
    if (existing && existing.status === 'running') {
      this.logger.info?.(`[xerj] Joining existing autoindex run ${existing.runId} for prefix ${prefix}`);
      return existing;
    }

    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const run = {
      runId,
      prefix,
      path,
      source,
      status: 'running', // 'running', 'needs-decision', 'done', 'failed', 'cancelled'
      phase: 'starting',
      pct: null,
      eta: null,
      bar: '',
      stdoutTail: [],
      startedAt: Date.now(),
      endedAt: null,
      exitCode: null,
      summary: null,
      decision: null,
      error: null
    };

    this.runs.set(prefix, run);
    this.emit('start', run);

    const abortController = new AbortController();
    this.activeProcesses.set(runId, abortController);

    const args = buildAutoindexArgs({
      path,
      prefix,
      url,
      apiKey,
      maxMinutes,
      approve,
      dryRun,
      fresh
    });

    (async () => {
      try {
        const result = await runXerj(binary, args, {
          cwd: path,
          signal: abortController.signal,
          onLine: (line) => {
            if (!line) return;
            if (run.stdoutTail.length >= 200) run.stdoutTail.shift();
            run.stdoutTail.push(line);

            const progress = parseProgressLine(line);
            if (progress) {
              run.phase = progress.phase || run.phase;
              if (typeof progress.pct === 'number') run.pct = progress.pct;
              if (progress.eta !== undefined) run.eta = progress.eta;
              run.stalledFor = progress.eta_quality === 'stalled' ? Number(progress.since_progress_s) || null : null;
              this.emit('progress', { runId, prefix, progress });
            } else if (line.startsWith('xerj-bar')) {
              run.bar = line.slice(9).trim();
              this.emit('progress', { runId, prefix, bar: run.bar });
            }
          }
        });

        run.endedAt = Date.now();
        run.exitCode = result.exitCode;
        this.activeProcesses.delete(runId);

        if (result.aborted) {
          run.status = 'cancelled';
          this.lastRuns.set(prefix, run);
          this.emit('done', run);
          return;
        }

        const classified = classifyExit(result.exitCode, result.stdout, result.stderr);
        run.status = classified.status;

        if (classified.status === 'done') {
          run.summary = classified.summary;
          this.lastSummaries.set(prefix, {
            ...classified.summary,
            indexedAt: Date.now()
          });
        } else if (classified.status === 'needs-decision') {
          run.decision = classified.decision;
        } else {
          run.error = classified.error;
        }

        this.lastRuns.set(prefix, run);
        this.emit('done', run);
      } catch (err) {
        run.endedAt = Date.now();
        run.status = 'failed';
        run.error = err.message;
        this.activeProcesses.delete(runId);
        this.lastRuns.set(prefix, run);
        this.emit('done', run);
      }
    })();

    return run;
  }

  cancelRun(runId) {
    const ctrl = this.activeProcesses.get(runId);
    if (ctrl) {
      ctrl.abort();
      this.activeProcesses.delete(runId);
      return true;
    }
    return false;
  }
}
