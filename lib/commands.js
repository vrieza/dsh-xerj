import { resolveWorkspace } from './workspace.js';

export function registerCommands(ctx, { runner, nodeManager, config, binary }) {
  if (!ctx.commands?.register) return;

  ctx.commands.register({
    name: 'xerj',
    description: 'Inspect XERJ search engine status, trigger indexing, or search symbols.',
    input: { type: 'string' },
    async handler(invocation) {
      const line = (invocation.rawInput ?? invocation.line ?? '').trim();
      const [subcmd, ...rest] = line.split(/\s+/);
      const cwd = invocation.agent?.session?.header?.cwd || process.cwd();
      const ws = resolveWorkspace(cwd, config);
      const prefix = ws.prefix;

      if (!subcmd || subcmd === 'status') {
        const last = runner.getLastSummary(prefix);
        const active = runner.getRun(prefix);
        return [
          `**XERJ Engine Status**`,
          `- Node: ${nodeManager.status} (${config.url})`,
          `- Project: ${ws.name} (${ws.root})`,
          `- Index Prefix: \`${prefix}\``,
          `- Last Indexed: ${last ? new Date(last.indexedAt).toLocaleString() : 'Never'}`,
          active && active.status === 'running'
            ? `- Active Indexing: ${active.phase} (${active.pct ?? 0}%)`
            : '- Active Indexing: None'
        ].join('\n');
      }

      if (subcmd === 'index') {
        if (!binary) return 'XERJ binary not found on host.';
        const run = await runner.startRun({
          binary,
          path: ws.root,
          prefix,
          url: config.url,
          apiKey: config.apiKey,
          maxMinutes: config.maxMinutes,
          source: 'command'
        });
        return `Started XERJ indexing for \`${prefix}\` (Run ID: ${run.runId}).`;
      }

      if (subcmd === 'console') {
        const consoleUrl = `${config.url}/_xerj-console/`;
        return `XERJ Web Console: [${consoleUrl}](${consoleUrl})`;
      }

      return `Unknown /xerj command: \`${subcmd}\`. Available: status, index, console.`;
    }
  });
}
