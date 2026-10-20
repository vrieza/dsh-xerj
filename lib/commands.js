import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveWorkspace } from './workspace.js';
import { updateAgentsMd } from './prompt.js';

export function registerCommands(ctx, { runner, nodeManager, config, binary }) {
  const commands = ctx.get('commands');
  if (!commands?.register) return;

  commands.register({
    name: 'xerj',
    description: 'Inspect XERJ search engine status, trigger indexing, or search symbols.',
    input: { hint: 'status | index | console | agents-md' },
    async handler(invocation) {
      const line = (invocation.rawInput ?? invocation.line ?? '').trim();
      const [subcmd, ...rest] = line.split(/\s+/);
      const cwd = invocation.agent?.session?.header?.cwd;
      if (!cwd) return "This session has no working folder, so the XERJ workspace prefix cannot be resolved.";
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

      if (subcmd === 'agents-md') {
        const file = join(ws.root, 'AGENTS.md');
        const existing = existsSync(file) ? readFileSync(file, 'utf8') : '';
        const updated = updateAgentsMd(existing, prefix);
        writeFileSync(file, updated, 'utf8');
        return `Updated AGENTS.md in ${ws.root} with prefix-aware XERJ instructions (prefix: \`${prefix}\`).`;
      }

      return `Unknown /xerj command: \`${subcmd}\`. Available: status, index, console, agents-md.`;
    }
  });
}
