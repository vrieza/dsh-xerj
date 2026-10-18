import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, openSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { diskState } from './config.js';

/**
 * NodeManager detects, adopts, or starts a dedicated local XERJ instance.
 */
export class NodeManager {
  /**
   * @param {object} config
   * @param {object} [logger]
   */
  constructor(config, logger = console) {
    this.config = config;
    this.logger = logger;
    this.status = 'unknown'; // 'healthy', 'adopted', 'managed', 'conflict', 'down'
    this.managedChild = null;
    this.clusterInfo = null;
    this.pidFile = resolve(config.dataDir, '../xerj-node.pid');
    this.logFile = resolve(config.dataDir, '../xerj-node.log');
    this.lastError = null;
    this.starting = null;
  }

  /**
   * Check if a URL responds with Elasticsearch/XERJ wire info.
   */
  async checkHealth(url = this.config.url) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${url}/_cluster/health`, {
        signal: controller.signal,
        headers: this.config.apiKey ? { Authorization: `ApiKey ${this.config.apiKey}` } : {}
      });
      clearTimeout(timeout);
      if (!res.ok) return { healthy: false, code: res.status };

      const rootRes = await fetch(`${url}/`, {
        headers: this.config.apiKey ? { Authorization: `ApiKey ${this.config.apiKey}` } : {}
      });
      const data = await rootRes.json();
      const isXerj = data.cluster_name === 'xerj' || (data.tagline && data.tagline.includes('Search'));
      return {
        healthy: true,
        isXerj,
        clusterName: data.cluster_name,
        version: data.version?.number || 'unknown'
      };
    } catch {
      return { healthy: false, isXerj: false };
    }
  }

  /**
   * Adopt existing node or launch managed node if permitted.
   */
  /** Start (or re-check) the node once; concurrent callers share the attempt. */
  ensure(binaryPath) {
    if (!this.starting) {
      this.status = 'starting';
      this.starting = this.init(binaryPath).finally(() => { this.starting = null; });
    }
    return this.starting;
  }

  /** Re-probe the configured URL so a node started outside DSH is noticed. */
  async refresh() {
    if (this.starting) return this.status;
    const h = await this.checkHealth();
    if (h.healthy && h.isXerj) {
      if (this.status !== 'managed') this.status = 'adopted';
      this.clusterInfo = h;
      this.lastError = null;
    } else if (h.healthy) {
      this.status = 'conflict';
    } else if (this.status === 'managed' || this.status === 'adopted') {
      this.status = 'down';
    }
    return this.status;
  }

  snapshot() {
    return {
      status: this.status,
      url: this.config.url,
      consoleUrl: `${this.config.url}/_xerj-console/`,
      managedPort: this.config.managedPort,
      dataDir: this.config.dataDir,
      logFile: this.logFile,
      version: this.clusterInfo?.version || null,
      error: this.lastError,
      owned: this.status === 'managed',
      disk: diskState(this.config.dataDir),
    };
  }

  async init(binaryPath) {
    this.lastError = null;
    const health = await this.checkHealth();
    if (health.healthy) {
      if (health.isXerj) {
        this.status = 'adopted';
        this.clusterInfo = health;
        this.logger.info?.(`[xerj] Adopted healthy node at ${this.config.url} (cluster: ${health.clusterName})`);
        return this.status;
      } else {
        this.status = 'conflict';
        this.lastError = `${this.config.url} answers but is not a XERJ node`;
        this.logger.warn?.(`[xerj] Port at ${this.config.url} is occupied by another non-XERJ service.`);
        return this.status;
      }
    }

    if (!this.config.manageNode) {
      this.status = 'down';
      return this.status;
    }

    if (!binaryPath) {
      this.status = 'down';
      this.lastError = 'xerj binary not found (install it or set the binary option)';
      this.logger.warn?.('[xerj] Cannot start managed node: XERJ binary not found.');
      return this.status;
    }

    return this.startManaged(binaryPath);
  }

  /**
   * Spawn a managed node on config.managedPort.
   */
  async startManaged(binaryPath) {
    try {
      mkdirSync(this.config.dataDir, { recursive: true });
      mkdirSync(dirname(this.pidFile), { recursive: true });

      const targetUrl = `http://127.0.0.1:${this.config.managedPort}`;
      const targetHealth = await this.checkHealth(targetUrl);
      if (targetHealth.healthy && targetHealth.isXerj) {
        this.config.url = targetUrl;
        this.status = 'adopted';
        return this.status;
      }

      const args = [
        '--data-dir', this.config.dataDir,
        '--port', String(this.config.managedPort)
      ];
      if (this.config.insecure) {
        args.push('--insecure');
      }

      const outStream = openSyncSafe(this.logFile);

      this.logger.info?.(`[xerj] Spawning managed node on port ${this.config.managedPort}...`);
      const child = spawn(binaryPath, args, {
        detached: true,
        stdio: ['ignore', outStream, outStream]
      });
      child.unref();

      this.managedChild = child;
      writeFileSync(this.pidFile, String(child.pid), 'utf8');

      // Poll until healthy up to 20 seconds
      const start = Date.now();
      while (Date.now() - start < 20000) {
        await new Promise(r => setTimeout(r, 800));
        const check = await this.checkHealth(targetUrl);
        if (check.healthy && check.isXerj) {
          this.config.url = targetUrl;
          this.status = 'managed';
          this.clusterInfo = check;
          this.logger.info?.(`[xerj] Managed node healthy at ${targetUrl} (pid ${child.pid})`);
          return this.status;
        }
      }

      this.status = 'down';
      this.lastError = `Node did not become healthy within 20s; see ${this.logFile}`;
      this.logger.error?.('[xerj] Timed out waiting for managed XERJ node to become healthy.');
      return this.status;
    } catch (err) {
      this.status = 'down';
      this.lastError = err.message;
      this.logger.error?.(`[xerj] Failed to start managed node: ${err.message}`);
      return this.status;
    }
  }

  /**
   * Stop managed node if owned.
   */
  async stop() {
    if (this.status !== 'managed' && !existsSync(this.pidFile)) {
      return false;
    }

    try {
      let pid = this.managedChild?.pid;
      if (!pid && existsSync(this.pidFile)) {
        pid = parseInt(readFileSync(this.pidFile, 'utf8').trim(), 10);
      }
      if (pid) {
        process.kill(pid, 'SIGTERM');
        this.logger.info?.(`[xerj] Stopped managed node (pid ${pid})`);
      }
    } catch (err) {
      this.logger.warn?.(`[xerj] Note while stopping node: ${err.message}`);
    } finally {
      if (existsSync(this.pidFile)) {
        try { unlinkSync(this.pidFile); } catch {}
      }
      this.status = 'down';
      this.managedChild = null;
    }
    return true;
  }
}

function openSyncSafe(filePath) {
  try {
    return openSync(filePath, 'a');
  } catch {
    return 'ignore';
  }
}
