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
    const handlers = new Map();
    const sessionStore = { get() {}, list: () => [] };
    // The route host is injected with webServer only; touching host.sessions throws like Cordis.
    const hostBase = { webServer: { register: (r) => { routes.push(r.path); handlers.set(r.path, r.handler); return () => {}; } }, effect: (fn) => fn(), get: (n) => (n === 'sessions' ? sessionStore : undefined) };
    const host = new Proxy(hostBase, { get(t, p) { if (p in t) return t[p]; if (p === 'sessions') throw new Error('cannot get property "sessions" without inject'); return undefined; } });
    // dsh's ctx.logger is callable: ctx.logger('name') returns a logger.
    const named = { info() {}, warn() {}, error() {}, debug() {} };
    const logger = Object.assign((name) => named, named);
    // Strict like Cordis: reading a service that is not in `inject` throws.
    const { inject } = await import('../lib/index.js');
    const services = {
      tools: { register: (t) => tools.push(t.name) },
      systemPrompt: { section() {} },
      commands: { register() {} },
      skills: { register() {} },
    };
    const base = { logger, inject: (_deps, cb) => cb(host), on() {}, get: (name) => services[name] };
    const ctx = new Proxy(base, {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (prop in services) {
          if (!inject.includes(prop)) throw new Error('cannot get property "' + String(prop) + '" without inject');
          return services[prop];
        }
        return undefined;
      },
    });
    apply(ctx, { manageNode: false, url: 'http://127.0.0.1:9' });

    assert.deepEqual(tools.sort(), ['xerj_autoindex', 'xerj_def', 'xerj_status']);
    for (const path of ['/dsh-xerj/config', '/dsh-xerj/status', '/dsh-xerj/index', '/dsh-xerj/setup', '/dsh-xerj/node']) {
      assert.ok(routes.includes(path), 'missing route ' + path);
    }

    // Call the status handler like the web server would: any exception becomes a bare 400 there.
    const out = { code: 0, body: '' };
    await handlers.get('/dsh-xerj/status')({ url: '/dsh-xerj/status?cwd=/tmp', method: 'GET', headers: { host: '127.0.0.1' } },
      { writeHead: (c) => { out.code = c; }, end: (b) => { out.body = String(b); } });
    assert.equal(out.code, 200, out.body);
    assert.ok(JSON.parse(out.body).workspace.prefix.startsWith('dsh-'));
  } finally {
    process.chdir(previous);
  }
});
