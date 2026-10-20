#!/usr/bin/env node
const args = process.argv.slice(2);

if (args.includes('--version')) {
  console.log('xerj v1.0.0-test');
  process.exit(0);
}

if (args[0] === 'autoindex') {
  if (args.includes('--fail')) {
    console.error('error: simulated autoindex failure');
    process.exit(1);
  }

  const approveIdx = args.indexOf('--approve');
  if (approveIdx !== -1) {
    const val = args[approveIdx + 1];
    if (val === 'cancel') {
      console.error('error: user cancelled');
      process.exit(1);
    }
  }

  const maxMinutesIdx = args.indexOf('--max-minutes');
  if (maxMinutesIdx !== -1 && args[maxMinutesIdx + 1] === '0') {
    // Simulate exit 4
    console.log(JSON.stringify({
      request_id: "req-fake-99",
      estimate_minutes: 25,
      recommendation: "fast"
    }));
    process.exit(4);
  }

  // Normal progress
  console.log('xerj-progress phase=scanning pct=25.0 eta=2s');
  console.log('xerj-bar [====>     ]');
  console.log('xerj-progress phase=indexing pct=80.0 eta=1s');
  console.log('xerj-bar [========> ]');
  console.log('xerj-done ok=true exit=0 reason=completed wall=1.5s datasets=2 records=150 junk=0 datasets_refused=0');
  process.exit(0);
}

if (args[0] === 'def') {
  console.log(JSON.stringify([
    { file: "lib/test.js", line: 10, kind: "function", signature: "helloWorld()" }
  ]));
  process.exit(0);
}

if (args[0] === 'search') {
  const prefixIdx = args.indexOf('--prefix');
  const prefix = prefixIdx !== -1 ? args[prefixIdx + 1] : null;
  console.log(JSON.stringify({
    prefix,
    cliArgs: args,
    hits: { total: { value: 1 }, hits: [{ _id: 'test-1', _source: { title: 'test match' } }] }
  }));
  process.exit(0);
}

console.log('xerj mock');
process.exit(0);
