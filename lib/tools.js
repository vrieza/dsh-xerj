import { defineTool } from '@deepseek-ai/dsh-tools';
import { resolveWorkspace } from './workspace.js';
import { assertDataDirOutside } from './config.js';
import { runXerj } from './cli.js';

export function registerTools(ctx, { config, binary, runner, nodeManager }) {
  // 1. xerj_status
  ctx.tools.register(defineTool({
    name: 'xerj_status',
    description: 'Check XERJ search engine node health, cluster info, and workspace indexing status.',
    parameters: {},
    output: {
      schema: { type: 'json' },
      render: (_args, val) => [{ type: 'text', text: JSON.stringify(val, null, 2) }]
    },
    async execute(_args, exec) {
      const cwd = exec?.agent?.session?.header?.cwd || process.cwd();
      const ws = resolveWorkspace(cwd, config);
      const prefix = ws.prefix;
      const lastSummary = runner.getLastSummary(prefix);
      const activeRun = runner.getRun(prefix);

      let indices = [];
      try {
        const res = await fetch(`${config.url}/_cat/indices/${prefix}-*?format=json`, {
          signal: exec?.signal,
          headers: config.apiKey ? { Authorization: `ApiKey ${config.apiKey}` } : {}
        });
        if (res.ok) indices = await res.json();
      } catch {}

      return {
        binary: binary || 'not_found',
        nodeStatus: nodeManager.status,
        url: config.url,
        cluster: nodeManager.clusterInfo || null,
        workspace: ws.root,
        prefix,
        indicesCount: indices.length,
        indices: indices.map(i => ({ index: i.index, docsCount: i['docs.count'], storeSize: i['store.size'] })),
        lastIndexed: lastSummary ? lastSummary.indexedAt : null,
        lastSummary,
        activeRun: activeRun ? {
          runId: activeRun.runId,
          status: activeRun.status,
          phase: activeRun.phase,
          pct: activeRun.pct,
          eta: activeRun.eta
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

      const cwd = exec?.agent?.session?.header?.cwd || process.cwd();
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
    description: 'Find where a symbol or capability is defined in the indexed workspace (go-to-definition).',
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

      const cwd = exec?.agent?.session?.header?.cwd || process.cwd();
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
}
