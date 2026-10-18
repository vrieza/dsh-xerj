import { spawn } from 'node:child_process';

/**
 * Execute xerj CLI with bounded output buffers and optional live streaming.
 * @param {string} binary
 * @param {string[]} args
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @param {Record<string, string>} [options.env]
 * @param {AbortSignal} [options.signal]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.maxBytes]
 * @param {(line: string) => void} [options.onLine]
 * @returns {Promise<{ exitCode: number|null, signal: string|null, stdout: string, stderr: string, aborted: boolean }>}
 */
export function runXerj(binary, args, options = {}) {
  const {
    cwd = process.cwd(),
    env = {},
    signal,
    timeoutMs = 300000,
    maxBytes = 256 * 1024,
    onLine
  } = options;

  return new Promise((resolve, reject) => {
    let stdoutAcc = '';
    let stderrAcc = '';
    let aborted = false;
    let timer = null;

    let lineBuffer = '';
    const child = spawn(binary, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const cleanup = () => {
      if (timer) clearTimeout(timer);
    };

    if (signal) {
      if (signal.aborted) {
        child.kill('SIGTERM');
        aborted = true;
      } else {
        signal.addEventListener('abort', () => {
          aborted = true;
          child.kill('SIGTERM');
        }, { once: true });
      }
    }

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        aborted = true;
        child.kill('SIGTERM');
      }, timeoutMs);
    }

    child.stdout.on('data', (chunk) => {
      const str = chunk.toString('utf8');
      if (stdoutAcc.length < maxBytes) {
        stdoutAcc += str.slice(0, maxBytes - stdoutAcc.length);
      }
      if (onLine) {
        lineBuffer += str;
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || '';
        for (const line of lines) {
          onLine(line);
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      const str = chunk.toString('utf8');
      if (stderrAcc.length < maxBytes) {
        stderrAcc += str.slice(0, maxBytes - stderrAcc.length);
      }
    });

    child.on('error', (err) => {
      cleanup();
      reject(err);
    });

    child.on('close', (exitCode, exitSignal) => {
      cleanup();
      if (lineBuffer && onLine) {
        onLine(lineBuffer);
      }
      resolve({
        exitCode,
        signal: exitSignal,
        stdout: stdoutAcc,
        stderr: stderrAcc,
        aborted
      });
    });
  });
}
