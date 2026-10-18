import { EventEmitter } from 'node:events';
import { runXerj } from './cli.js';
import { buildAutoindexArgs, parseProgressLine, parseDoneLine, classifyExit } from './autoindex.js';

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
    this.lastSummaries = new Map();
    this.activeProcesses = new Map();
  }

  getRun(prefix) {
    return this.runs.get(prefix) || null;
  }

  getLastSummary(prefix) {
    return this.lastSummaries.get(prefix) || null;
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

        this.emit('done', run);
      } catch (err) {
        run.endedAt = Date.now();
        run.status = 'failed';
        run.error = err.message;
        this.activeProcesses.delete(runId);
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
