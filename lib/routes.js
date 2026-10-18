import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runXerj } from './cli.js';
import { assertDataDirOutside, diskState } from './config.js';
import { buildSkillContent } from './prompt.js';
import { resolveWorkspace, setupState, sessionCwd, knownWorkspaces } from './workspace.js';

function isLoopbackRequest(req) {
  const host = req.headers.host || '';
  return /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host);
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const str = Buffer.concat(chunks).toString('utf8');
  return str ? JSON.parse(str) : {};
}

function authHeaders(config) {
  return config.apiKey ? { Authorization: `ApiKey ${config.apiKey}` } : {};
}

/**
 * Work out which folder a request is about. Priority: explicit path, the
 * session's recorded cwd, the cwd the client passed, then the host cwd.
 */
export function resolveTarget({ path, sessionId, cwd }, ctx) {
  const chosen = path || sessionCwd(sessionsOf(ctx), sessionId) || cwd || process.cwd();
  return chosen;
}

async function listIndices(config, prefix) {
  try {
    const res = await fetch(`${config.url}/_cat/indices/${prefix}-*?format=json`, {
      headers: authHeaders(config),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const rows = await res.json();
    return rows.map((i) => ({ index: i.index, docs: Number(i['docs.count'] || 0), size: i['store.size'] }));
  } catch {
    return [];
  }
}

function runView(run) {
  if (!run) return null;
  return {
    runId: run.runId,
    status: run.status,
    phase: run.phase,
    pct: run.pct,
    eta: run.eta,
    stalledFor: run.stalledFor ?? null,
    bar: run.bar,
    decision: run.decision,
    summary: run.summary,
    error: run.error,
    path: run.path,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    tail: (run.stdoutTail || []).slice(-6),
  };
}

/**
 * The session store, if the host exposes one. The route context is injected with
 * webServer only, so reading ctx.sessions directly throws in dsh; use ctx.get().
 */
function sessionsOf(ctx) {
  try { return ctx?.get?.('sessions'); } catch { return undefined; }
}

export function mountRoutes(webServer, { runner, nodeManager, config, binary, ctx }) {
  const nodeView = () => ({ ...nodeManager.snapshot?.() ?? { status: nodeManager.status, url: config.url }, binary: binary || null });

  const routes = [
    {
      kind: 'exact',
      path: '/dsh-xerj/config',
      handler: async (req, res) => {
        if (req.method === 'GET') {
          return sendJson(res, 200, {
            config: { ...config, apiKey: config.apiKey ? '***' : '' },
            ui: config.ui,
            url: config.url,
            consoleUrl: `${config.url}/_xerj-console/`,
            nodeStatus: nodeManager.status,
            cluster: nodeManager.clusterInfo || null,
          });
        }
        if (req.method === 'POST') {
          if (!isLoopbackRequest(req)) return sendJson(res, 403, { error: 'Untrusted origin' });
          try {
            const body = await readBody(req);
            if (typeof body.keepFresh === 'boolean') config.keepFresh = body.keepFresh;
            if (typeof body.keepFreshDebounceMs === 'number') config.keepFreshDebounceMs = body.keepFreshDebounceMs;
            if (typeof body.maxMinutes === 'number') config.maxMinutes = body.maxMinutes;
            if (body.ui && typeof body.ui === 'object') config.ui = { ...config.ui, ...body.ui };
            return sendJson(res, 200, { ok: true });
          } catch (err) {
            return sendJson(res, 500, { error: err.message });
          }
        }
        sendJson(res, 405, { error: 'Method not allowed' });
      },
    },
    {
      kind: 'exact',
      path: '/dsh-xerj/status',
      handler: async (req, res) => {
        const u = new URL(req.url, 'http://localhost');
        const target = resolveTarget({
          path: u.searchParams.get('path'),
          sessionId: u.searchParams.get('sessionId'),
          cwd: u.searchParams.get('cwd'),
        }, ctx);
        await nodeManager.refresh?.();
        const ws = resolveWorkspace(target, config);
        const indices = nodeManager.status === 'managed' || nodeManager.status === 'adopted'
          ? await listIndices(config, ws.prefix) : [];
        sendJson(res, 200, {
          node: nodeView(),
          nodeStatus: nodeManager.status,
          url: config.url,
          workspace: ws,
          prefix: ws.prefix,
          indexed: indices.length > 0,
          docs: indices.reduce((n, i) => n + i.docs, 0),
          indices,
          lastSummary: runner.getLastSummary(ws.prefix),
          activeRun: runView(runner.getRun(ws.prefix)),
          setup: ws.exists ? setupState(ws.root) : null,
          workspaces: knownWorkspaces(sessionsOf(ctx), config),
        });
      },
    },
    {
      kind: 'exact',
      path: '/dsh-xerj/node',
      handler: async (req, res) => {
        if (req.method === 'GET') return sendJson(res, 200, nodeView());
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
        if (!isLoopbackRequest(req)) return sendJson(res, 403, { error: 'Untrusted origin' });
        const body = await readBody(req).catch(() => ({}));
        if (body.action === 'stop') {
          await nodeManager.stop();
          return sendJson(res, 200, nodeView());
        }
        if (!binary) return sendJson(res, 503, { ...nodeView(), error: 'xerj binary not found' });
        await nodeManager.ensure(binary);
        sendJson(res, 200, nodeView());
      },
    },
    {
      kind: 'exact',
      path: '/dsh-xerj/index',
      handler: async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
        if (!isLoopbackRequest(req)) return sendJson(res, 403, { error: 'Untrusted origin' });
        try {
          if (!binary) return sendJson(res, 503, { error: 'xerj binary not found' });
          const body = await readBody(req);
          const ws = resolveWorkspace(resolveTarget(body, ctx), config);
          if (!ws.exists) return sendJson(res, 400, { error: `Folder does not exist: ${ws.root}` });
          assertDataDirOutside(config.dataDir, ws.root);
          const disk = diskState(config.dataDir);
          if (disk?.blocked) {
            return sendJson(res, 507, { error: `Disk is ${disk.usedPct}% full (${disk.freeGb} GB free). XERJ stops accepting writes at 95%, so indexing would hang. Free some space and try again.` });
          }
          if (nodeManager.status !== 'managed' && nodeManager.status !== 'adopted') await nodeManager.ensure(binary);
          if (nodeManager.status !== 'managed' && nodeManager.status !== 'adopted') {
            return sendJson(res, 503, { error: nodeManager.lastError || 'XERJ node is not running' });
          }
          const run = await runner.startRun({
            binary,
            path: ws.root,
            prefix: ws.prefix,
            url: config.url,
            apiKey: config.apiKey,
            maxMinutes: config.maxMinutes,
            approve: body.approve,
            fresh: Boolean(body.fresh),
            source: 'ui',
          });
          sendJson(res, 200, { run: runView(run) });
        } catch (err) {
          sendJson(res, 400, { error: err.message });
        }
      },
    },
    {
      kind: 'exact',
      path: '/dsh-xerj/cancel',
      handler: async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
        if (!isLoopbackRequest(req)) return sendJson(res, 403, { error: 'Untrusted origin' });
        const body = await readBody(req);
        if (!body.runId) return sendJson(res, 400, { error: 'runId required' });
        sendJson(res, 200, { cancelled: runner.cancelRun(body.runId) });
      },
    },
    {
      kind: 'exact',
      path: '/dsh-xerj/setup',
      handler: async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
        if (!isLoopbackRequest(req)) return sendJson(res, 403, { error: 'Untrusted origin' });
        try {
          const body = await readBody(req);
          const ws = resolveWorkspace(resolveTarget(body, ctx), config);
          if (!ws.exists) return sendJson(res, 400, { error: `Folder does not exist: ${ws.root}` });

          if (body.action === 'skill') {
            const dir = join(ws.root, '.agents', 'skills', 'xerj');
            mkdirSync(dir, { recursive: true });
            const file = join(dir, 'SKILL.md');
            writeFileSync(file, buildSkillContent(ws.prefix), 'utf8');
            return sendJson(res, 200, { ok: true, wrote: [file], setup: setupState(ws.root) });
          }

          if (body.action === 'init') {
            if (!binary) return sendJson(res, 503, { error: 'xerj binary not found' });
            const args = ['init', '--url', config.url];
            if (body.dryRun) args.push('--dry-run');
            const r = await runXerj(binary, args, { cwd: ws.root, timeoutMs: 30000 });
            return sendJson(res, r.exitCode === 0 ? 200 : 500, {
              ok: r.exitCode === 0,
              output: (r.stdout + r.stderr).trim(),
              setup: setupState(ws.root),
            });
          }
          sendJson(res, 400, { error: 'action must be "skill" or "init"' });
        } catch (err) {
          sendJson(res, 500, { error: err.message });
        }
      },
    },
    {
      kind: 'exact',
      path: '/dsh-xerj/gain',
      handler: async (req, res) => {
        if (!binary) return sendJson(res, 503, { error: 'XERJ binary unavailable' });
        if (nodeManager.status !== 'managed' && nodeManager.status !== 'adopted') return sendJson(res, 200, {});
        const result = await runXerj(binary, ['gain', '--json', '--url', config.url], { timeoutMs: 5000 });
        try {
          return sendJson(res, 200, JSON.parse(result.stdout));
        } catch {
          return sendJson(res, 200, {});
        }
      },
    },
  ];

  const disposers = routes.map((r) => webServer.register(r));
  return () => {
    for (const d of disposers) d();
  };
}
