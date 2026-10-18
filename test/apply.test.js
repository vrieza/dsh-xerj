import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';

// Regression for the boot crashes that made the plugin silently not load:
//  1. config validation threw when dsh was started from $HOME
//  2. defineTool rejected the tool output schemas
// Needs the local links: run "npm run setup:links" first.
test('apply() boots from $HOME, registers tools and routes', async () => {
  const previous = process.cwd();
  process.chdir(homedir());
  try {
    const { apply, Config } = await import('../lib/index.js');
    assert.ok(Config, 'host must export a Config schema for the Settings page');

    const tools = [];
    const routes = [];
    const host = { webServer: { register: (r) => { routes.push(r.path); return () => {}; } }, sessions: { get() {}, list: () => [] }, effect: (fn) => fn() };
    const ctx = {
      tools: { register: (t) => tools.push(t.name) },
      systemPrompt: { section() {} },
      commands: { register() {} },
      inject: (_deps, cb) => cb(host),
      on() {},
    };
    apply(ctx, { manageNode: false, url: 'http://127.0.0.1:9' });

    assert.deepEqual(tools.sort(), ['xerj_autoindex', 'xerj_def', 'xerj_status']);
    for (const path of ['/dsh-xerj/config', '/dsh-xerj/status', '/dsh-xerj/index', '/dsh-xerj/setup', '/dsh-xerj/node']) {
      assert.ok(routes.includes(path), 'missing route ' + path);
    }
  } finally {
    process.chdir(previous);
  }
});
