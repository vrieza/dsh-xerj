import z from '@deepseek-ai/schemastery';

/**
 * Loader row configuration schema for dsh-xerj.
 * Persistent fields trigger remount on change.
 * Volatile fields (.volatile()) commit live without remounting the plugin.
 */
export const Config = z.object({
  binary: z.string().default('auto').description('Path to xerj executable or "auto" for discovery'),
  url: z.string().default('http://127.0.0.1:9200').description('XERJ node HTTP endpoint'),
  manageNode: z.boolean().default(true).description('Automatically spawn managed local node if none running'),
  managedPort: z.number().default(9200).description('Port the plugin starts its own node on when none is running (also claims port+1, port+2)'),
  dataDir: z.string().default('~/.dsh/xerj/data').description('Storage directory for managed node'),
  insecure: z.boolean().default(true).description('Disable TLS & API auth for local loopback dev node'),
  stopOnDispose: z.boolean().default(true).description('Stop managed node when DSH plugin unloads'),
  prefix: z.string().default('auto').description('Index prefix ("auto" uses dsh-<project>-<hash>)'),
  maxMinutes: z.number().default(10).description('Time estimate limit before prompting user approval'),
  keepFresh: z.boolean().default(true).volatile().description('Re-index project on agent file modifications'),
  keepFreshDebounceMs: z.number().default(20000).volatile().description('Debounce window before re-index in ms'),
  promptSection: z.boolean().default(true).volatile().description('Inject XERJ instructions into system prompt'),
  ui: z.object({
    toolCards: z.boolean().default(true).description('Enable rich chat tool cards for search and definitions'),
    sidebarPanel: z.boolean().default(true).description('Enable XERJ tab in right sidebar / Better Sidebar'),
    consoleTab: z.boolean().default(true).description('Enable embedded XERJ Console browser tab'),
  }).default({}).volatile().description('UI visual presentation controls'),
});
