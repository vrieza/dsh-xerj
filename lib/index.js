import { validateConfig } from './config.js';
import { resolveXerjBinary } from './binary.js';
import { NodeManager } from './node.js';
import { IndexRunner } from './runner.js';
import { registerTools } from './tools.js';
import { registerCommands } from './commands.js';
import { mountRoutes } from './routes.js';
import { resolveWorkspace } from './workspace.js';
import { buildSystemPromptSection, buildSkillContent } from './prompt.js';

export { Config } from './schema.js';
export const name = 'xerj';
export const inject = ['tools', 'systemPrompt'];

export function apply(ctx, rawConfig) {
  const log = ctx.logger?.('xerj') ?? console;
  const config = validateConfig(rawConfig);
  const binary = resolveXerjBinary(config.binary);
  const runner = new IndexRunner(log);
  const nodeManager = new NodeManager(config, log);

  process.env.XERJ_URL = config.url;
  if (binary) process.env.XERJ_BIN = binary;

  // Start or adopt the node without blocking boot.
  nodeManager.ensure(binary).catch((err) => log.warn?.(`[xerj] node start failed: ${err.message}`));

  registerTools(ctx, { config, binary, runner, nodeManager });

  if (config.promptSection) {
    ctx.systemPrompt?.section?.({
      name: 'xerj',
      order: 9000,
      text: (agent) => {
        const cwd = agent?.session?.header?.cwd || process.cwd();
        const ws = resolveWorkspace(cwd, config);
        return buildSystemPromptSection(ws.prefix, Boolean(runner.getLastSummary(ws.prefix)));
      },
    });
  }

  if (ctx.skills?.register) {
    ctx.skills.register({
      name: 'xerj',
      description: 'Use XERJ for AI-native code search and fast reference retrieval.',
      content: buildSkillContent('dsh-<project>-<hash>'),
      source: 'runtime',
    });
  }

  registerCommands(ctx, { runner, nodeManager, config, binary });

  ctx.inject(['webServer'], (host) => {
    host.effect(() => mountRoutes(host.webServer, { runner, nodeManager, config, binary, ctx: host }), 'dsh-xerj: http routes');
  });

  ctx.on('dispose', async () => {
    if (config.stopOnDispose) await nodeManager.stop();
  });
}
