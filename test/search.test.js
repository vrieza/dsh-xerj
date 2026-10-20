import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerTools } from '../lib/tools.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fakeBinary = path.join(__dirname, 'fixtures', 'fake-xerj.mjs');

test('xerj_search tool registration and behavior', async () => {
  let indicesResponse = [];
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/_cat/indices/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(indicesResponse));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}`;

  try {
    const tools = new Map();
    const ctx = {
      tools: {
        register: (tool) => tools.set(tool.name, tool)
      }
    };
    const config = { url, apiKey: null };
    const runner = {
      getLastSummary: () => null,
      getRun: () => null
    };
    const nodeManager = { status: 'managed', clusterInfo: null };

    registerTools(ctx, { config, binary: fakeBinary, runner, nodeManager });

    const searchTool = tools.get('xerj_search');
    assert.ok(searchTool, 'xerj_search must be registered');
    assert.ok(searchTool.output, 'xerj_search must have output definition');
    assert.equal(searchTool.parameters?.properties?.query?.type, 'string');
    assert.ok(searchTool.parameters?.required?.includes('query'));

    const exec = {
      agent: {
        session: {
          header: {
            cwd: '/tmp'
          }
        }
      }
    };

    // Case 1: 0 indices match the prefix -> returns explicit not_indexed error
    indicesResponse = [];
    const resNotIndexed = await searchTool.execute({ query: 'auth token' }, exec);
    assert.equal(resNotIndexed.error, 'not_indexed');
    assert.ok(resNotIndexed.prefix, 'must include prefix');
    assert.ok(resNotIndexed.message.includes('xerj_autoindex'), 'must suggest xerj_autoindex');

    // Case 2: Indices exist -> runs xerj search and passes --prefix and -k
    indicesResponse = [{ index: `${resNotIndexed.prefix}-docs` }];
    const resFound = await searchTool.execute({ query: 'auth token', k: 7 }, exec);
    assert.equal(resFound.prefix, resNotIndexed.prefix, '--prefix must match workspace prefix');
    assert.ok(resFound.cliArgs.includes('--prefix'), 'must include --prefix');
    assert.ok(resFound.cliArgs.includes(resNotIndexed.prefix), 'must include prefix value');
    assert.ok(resFound.cliArgs.includes('-k') && resFound.cliArgs.includes('7'), 'must pass -k');

    // Case 3: Missing binary returns error
    const toolsNoBin = new Map();
    const ctxNoBin = { tools: { register: (t) => toolsNoBin.set(t.name, t) } };
    registerTools(ctxNoBin, { config, binary: null, runner, nodeManager });
    const resNoBin = await toolsNoBin.get('xerj_search').execute({ query: 'test' }, exec);
    assert.ok(resNoBin.error, 'must report binary error');
  } finally {
    server.close();
  }
});
