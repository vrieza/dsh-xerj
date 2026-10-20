import { defineTool } from '@deepseek-ai/dsh-tools';
import { resolveWorkspace } from './workspace.js';
import { assertDataDirOutside } from './config.js';
import { runXerj } from './cli.js';

const NO_CWD = { error: "no_session_cwd", message: "This session has no working folder, so the XERJ workspace prefix cannot be resolved." };

export function registerTools(ctx, { config, binary, runner, nodeManager }) {
  // 1. xerj_status
  ctx.tools.register(defineTool({
    name: 'xerj_status',
    description: 'Check XERJ search engine node health, cluster info, and workspace indexing status (check the "indexed" boolean flag).',
    parameters: {},
    output: {
      schema: { type: 'json' },
      render: (_args, val) => [{ type: 'text', text: JSON.stringify(val, null, 2) }]
    },
    async execute(_args, exec) {
      const cwd = exec?.agent?.session?.header?.cwd;
      if (!cwd) return NO_CWD;
      const ws = resolveWorkspace(cwd, config);
      const prefix = ws.prefix;
      let lastSummary = runner.getLastSummary(prefix);
      const activeRun = runner.getActiveRun ? runner.getActiveRun(prefix) : (runner.getRun(prefix)?.status === 'running' ? runner.getRun(prefix) : null);
      const lastRun = runner.getLastRun ? runner.getLastRun(prefix) : (runner.getRun(prefix)?.status !== 'running' ? runner.getRun(prefix) : null);

      let indices = [];
      try {
        const res = await fetch(`${config.url}/_cat/indices/${prefix}-*?format=json`, {
          signal: exec?.signal,
          headers: config.apiKey ? { Authorization: `ApiKey ${config.apiKey}` } : {}
        });
        if (res.ok) indices = await res.json();
      } catch {}

      const indicesCount = indices.length;
      if (!lastSummary && config.url) {
        lastSummary = await (runner.fetchLastSummary ? runner.fetchLastSummary(prefix, {
          url: config.url,
          apiKey: config.apiKey,
          signal: exec?.signal
        }) : runner.getLastSummary(prefix, {
          url: config.url,
          apiKey: config.apiKey,
          signal: exec?.signal
        }));
      }

      return {
        binary: binary || 'not_found',
        nodeStatus: nodeManager.status,
        url: config.url,
        cluster: nodeManager.clusterInfo || null,
        workspace: ws.root,
        prefix,
        indexed: indicesCount > 0,
        indicesCount,
        indices: indices.map(i => ({ index: i.index, docsCount: i['docs.count'], storeSize: i['store.size'] })),
        lastIndexed: lastSummary ? lastSummary.indexedAt : null,
        lastSummary,
        activeRun: activeRun ? {
          runId: activeRun.runId,
          status: activeRun.status,
          phase: activeRun.phase,
          pct: activeRun.pct,
          eta: activeRun.eta
        } : null,
        lastRun: lastRun ? {
          runId: lastRun.runId,
          status: lastRun.status,
          phase: lastRun.phase,
          pct: lastRun.pct,
          eta: lastRun.eta,
          exitCode: lastRun.exitCode ?? null,
          summary: lastRun.summary || null,
          error: lastRun.error || null
        } : null
      };
    }
  }));

  // 2. xerj_autoindex
  ctx.tools.register(defineTool({
    name: 'xerj_autoindex',
    description: 'Index the current project workspace using XERJ zero-config discovery for fast code search.',
    parameters: {
      path: { type: 'string', description: 'Folder path to index (defaults to current workspace)' },
      approve: { type: 'string', description: 'Answer large index decision request: "proceed", "fast", or "cancel"' },
      dryRun: { type: 'boolean', description: 'Walk and plan index without writing records' },
      wait: { type: 'boolean', description: 'Wait for indexing to complete before returning (default: false)' }
    },
    output: {
      schema: { type: 'json' },
      render: (_args, val) => [{ type: 'text', text: JSON.stringify(val, null, 2) }]
    },
    async execute(args, exec) {
      if (!binary) {
        return { error: 'XERJ binary not found. Please install xerj or configure XERJ_BIN.' };
      }

      const cwd = exec?.agent?.session?.header?.cwd;
      if (!args.path && !cwd) return NO_CWD;
      const ws = resolveWorkspace(args.path || cwd, config);
      const targetPath = ws.root;
      const prefix = ws.prefix;
      assertDataDirOutside(config.dataDir, targetPath);
      if (nodeManager.status !== 'managed' && nodeManager.status !== 'adopted') await nodeManager.ensure(binary);

      const run = await runner.startRun({
        binary,
        path: targetPath,
        prefix,
        url: config.url,
        apiKey: config.apiKey,
        maxMinutes: config.maxMinutes,
        approve: args.approve,
        dryRun: args.dryRun,
        source: 'model'
      });

      if (args.wait) {
        if (run.status === 'running') {
          await new Promise((resolve) => {
            const onDone = (r) => {
              if (r.runId === run.runId) {
                runner.off('done', onDone);
                resolve();
              }
            };
            runner.on('done', onDone);
            if (exec?.signal) {
              exec.signal.addEventListener('abort', () => {
                runner.off('done', onDone);
                resolve();
              }, { once: true });
            }
          });
        }
      }

      return {
        runId: run.runId,
        prefix: run.prefix,
        status: run.status,
        phase: run.phase,
        pct: run.pct,
        eta: run.eta,
        decision: run.decision,
        summary: run.summary,
        error: run.error
      };
    }
  }));

  // 3. xerj_def
  ctx.tools.register(defineTool({
    name: 'xerj_def',
    description: 'Find where a symbol or capability is defined in the indexed workspace (go-to-definition; workspace prefix is injected automatically).',
    parameters: {
      symbol: { type: 'string', required: true, description: 'Symbol name, identifier, or capability' },
      kind: { type: 'string', description: 'Filter by symbol kind (function, class, method, etc.)' },
      lang: { type: 'string', description: 'Filter by programming language (typescript, python, rust, etc.)' },
      k: { type: 'number', description: 'Number of definitions to return (default: 5)' }
    },
    output: {
      schema: { type: 'json' },
      render: (_args, val) => [{ type: 'text', text: JSON.stringify(val, null, 2) }]
    },
    async execute(args, exec) {
      if (!binary) {
        return [{ error: 'XERJ binary not found.' }];
      }

      const cwd = exec?.agent?.session?.header?.cwd;
      if (!cwd) return NO_CWD;
      const ws = resolveWorkspace(cwd, config);
      const prefix = ws.prefix;

      const cliArgs = ['def', args.symbol, '--json', '--prefix', prefix];
      if (config.url) cliArgs.push('--url', config.url);
      if (config.apiKey) cliArgs.push('--api-key', config.apiKey);
      if (args.kind) cliArgs.push('--kind', args.kind);
      if (args.lang) cliArgs.push('--lang', args.lang);
      if (typeof args.k === 'number') cliArgs.push('-k', String(args.k));

      const res = await runXerj(binary, cliArgs, {
        cwd: ws.root,
        signal: exec?.signal,
        timeoutMs: 30000
      });

      if (res.exitCode !== 0) {
        return [{ error: res.stderr || res.stdout || 'Definition search failed.' }];
      }

      try {
        return JSON.parse(res.stdout);
      } catch {
        return [{ raw: res.stdout }];
      }
    }
  }));

  // 4. xerj_search
  ctx.tools.register(defineTool({
    name: 'xerj_search',
    description: 'Search the indexed workspace for relevant code passages using XERJ (natural-language code search; workspace prefix is injected automatically).',
    parameters: {
      query: { type: 'string', required: true, description: 'What you need, in plain words (e.g. "auth middleware token validation")' },
      k: { type: 'number', description: 'Number of passages to return (default: 5)' }
    },
    output: {
      schema: { type: 'json' },
      render: (_args, val) => [{ type: 'text', text: JSON.stringify(val, null, 2) }]
    },
    async execute(args, exec) {
      if (!binary) {
        return { error: 'XERJ binary not found.' };
      }

      const cwd = exec?.agent?.session?.header?.cwd;
      if (!cwd) return NO_CWD;
      const ws = resolveWorkspace(cwd, config);
      const prefix = ws.prefix;

      if (config.url) {
        try {
          const res = await fetch(`${config.url}/_cat/indices/${prefix}-*?format=json`, {
            signal: exec?.signal,
            headers: config.apiKey ? { Authorization: `ApiKey ${config.apiKey}` } : {}
          });
          if (res.ok) {
            const indices = await res.json();
            if (Array.isArray(indices) && indices.length === 0) {
              return {
                error: 'not_indexed',
                prefix,
                workspace: ws.root,
                message: `Workspace "${ws.root}" is not indexed under prefix "${prefix}". Run tool xerj_autoindex first.`
              };
            }
          }
        } catch {}
      }

      const cliArgs = ['search', args.query, '--json', '--prefix', prefix];
      if (config.url) cliArgs.push('--url', config.url);
      if (config.apiKey) cliArgs.push('--api-key', config.apiKey);
      if (typeof args.k === 'number') cliArgs.push('-k', String(args.k));

      const res = await runXerj(binary, cliArgs, {
        cwd: ws.root,
        signal: exec?.signal,
        timeoutMs: 30000
      });

      if (res.exitCode !== 0) {
        return { error: res.stderr || res.stdout || 'Search failed.' };
      }

      try {
        return JSON.parse(res.stdout);
      } catch {
        return { raw: res.stdout };
      }
    }
  }));
}
