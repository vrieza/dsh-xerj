window.__ModuleLoader__.load({
  id: "dsh-xerj",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const react = require("react");
    const h = react.createElement;
    const { useState, useEffect, useRef } = react;

    const NS = "dsh-xerj";

    const en = {
      nav: "XERJ",
      title: "XERJ Search",
      clusterHealthy: "Connected",
      clusterDown: "Node Down",
      clusterConflict: "Port Conflict",
      openConsole: "Open Console",
      reindex: "Re-index Project",
      indexing: "Indexing in progress",
      records: "Indexed Records",
      lastIndexed: "Last Indexed",
      never: "Never",
      proceed: "Proceed (Full)",
      fast: "Fast (No Embeddings)",
      cancel: "Cancel",
      decisionPrompt: "Large repo estimate exceeded limit. Choose action:",
      searchesServed: "Searches Served",
      hitRate: "Hit Rate",
      latency: "Avg Latency",
      settingsTitle: "XERJ Search Settings",
      settingsSaved: "Settings saved successfully",
      nodeConfig: "Engine Node",
      indexingConfig: "Auto-Indexing",
      uiConfig: "Visual & GUI Experience"
    };

    const zh = {
      nav: "XERJ",
      title: "XERJ 搜索",
      clusterHealthy: "已连接",
      clusterDown: "服务未运行",
      clusterConflict: "端口冲突",
      openConsole: "打开控制台",
      reindex: "重新建立索引",
      indexing: "正在建立索引",
      records: "索引文档数",
      lastIndexed: "最后索引时间",
      never: "从未",
      proceed: "继续全量索引",
      fast: "快速索引 (跳过向量)",
      cancel: "取消",
      decisionPrompt: "仓库规模估算超出预设时间，请选择执行策略：",
      searchesServed: "搜索次数",
      hitRate: "命中率",
      latency: "平均延迟",
      settingsTitle: "XERJ 搜索设置",
      settingsSaved: "设置已保存",
      nodeConfig: "搜索引擎节点",
      indexingConfig: "自动索引配置",
      uiConfig: "视觉与界面交互"
    };

    // SVG Icons
    function IconSearch(props) {
      return h("svg", { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, ...props },
        h("circle", { cx: 7, cy: 7, r: 4.5 }),
        h("path", { d: "M10.5 10.5L14 14", strokeLinecap: "round" })
      );
    }

    function IconExternal(props) {
      return h("svg", { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, ...props },
        h("path", { d: "M7 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V9", strokeLinecap: "round" }),
        h("path", { d: "M10 2h4v4M6.5 9.5L14 2", strokeLinecap: "round", strokeLinejoin: "round" })
      );
    }

    // Styles helper
    const cardStyle = {
      backgroundColor: "var(--dsh-surface-subtle, rgba(255,255,255,0.04))",
      border: "1px solid var(--dsh-border-subtle, rgba(255,255,255,0.08))",
      borderRadius: 8,
      padding: 12,
      marginBottom: 12,
      fontSize: 13
    };

    const btnStyle = {
      padding: "6px 12px",
      borderRadius: 6,
      border: "1px solid var(--dsh-border, rgba(255,255,255,0.15))",
      backgroundColor: "var(--dsh-interactive-secondary, rgba(255,255,255,0.08))",
      color: "inherit",
      cursor: "pointer",
      fontSize: 12,
      fontWeight: 500,
      display: "inline-flex",
      alignItems: "center",
      gap: 6
    };

    const primaryBtnStyle = {
      ...btnStyle,
      backgroundColor: "var(--dsh-interactive-primary, #3b82f6)",
      color: "#fff",
      borderColor: "transparent"
    };

    const inputStyle = {
      width: "100%",
      padding: "6px 10px",
      borderRadius: 6,
      border: "1px solid var(--dsh-border, rgba(255,255,255,0.15))",
      backgroundColor: "var(--dsh-input-bg, rgba(0,0,0,0.25))",
      color: "inherit",
      fontSize: 12,
      boxSizing: "border-box",
      marginBottom: 8
    };

    // ---------------- Sidebar panel ----------------
    async function api(path, body) {
      const res = await fetch(path, body === undefined ? {} : {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      let data = {};
      try { data = await res.json(); } catch {}
      if (!res.ok && !data.error) data.error = 'HTTP ' + res.status;
      return data;
    }

    const NODE_LABEL = {
      managed: ['Running (started by DSH)', '#10b981'],
      adopted: ['Running', '#10b981'],
      starting: ['Starting…', '#f59e0b'],
      unknown: ['Checking…', '#f59e0b'],
      conflict: ['Port taken by another service', '#ef4444'],
      down: ['Not running', '#ef4444']
    };

    function Section(props) {
      return h("div", { style: cardStyle },
        h("div", { style: { fontWeight: 600, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" } },
          h("span", null, props.title), props.right || null),
        props.children);
    }

    function Row(props) {
      return h("div", { style: { display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, marginBottom: 4 } },
        h("span", { style: { opacity: 0.7 } }, props.label),
        h("span", { style: { fontFamily: props.mono ? "monospace" : undefined, textAlign: "right", wordBreak: "break-all" } }, props.value));
    }

    function Check(props) {
      return h("div", { style: { fontSize: 12, marginBottom: 3 } },
        h("span", { style: { color: props.on ? "#10b981" : "var(--dsh-text-muted, #94a3b8)", marginRight: 6 } }, props.on ? "✓" : "○"),
        props.label);
    }

    function XerjPanel(props) {
      const { sidebarRight, scope, visible = true } = props;
      const sessionId = scope?.sessionId || '';
      const sessionCwd = scope?.repoRoot || scope?.cwd || '';

      const [override, setOverride] = useState('');
      const [pathDraft, setPathDraft] = useState('');
      const [status, setStatus] = useState(null);
      const [gain, setGain] = useState(null);
      const [busy, setBusy] = useState('');
      const [message, setMessage] = useState(null);
      const [initOutput, setInitOutput] = useState('');

      // A new conversation resets the manual override.
      useEffect(() => { setOverride(''); setInitOutput(''); setMessage(null); }, [sessionId]);

      const target = override || sessionCwd;
      const targetBody = () => (override ? { path: override } : { sessionId, cwd: sessionCwd });

      const load = async () => {
        const q = new URLSearchParams();
        if (override) q.set('path', override);
        else {
          if (sessionId) q.set('sessionId', sessionId);
          if (sessionCwd) q.set('cwd', sessionCwd);
        }
        const data = await api('/dsh-xerj/status?' + q.toString());
        if (!data.error) setStatus(data);
        else setMessage({ kind: 'error', text: 'XERJ plugin unreachable: ' + data.error });
      };

      const running = status?.activeRun?.status === 'running';
      const nodeUp = status?.nodeStatus === 'managed' || status?.nodeStatus === 'adopted';

      useEffect(() => {
        if (!visible) return;
        load();
        const ms = running || status?.nodeStatus === 'starting' ? 1500 : 6000;
        const timer = setInterval(load, ms);
        return () => clearInterval(timer);
      }, [visible, running, status?.nodeStatus, target, sessionId]);

      useEffect(() => {
        if (visible && nodeUp) api('/dsh-xerj/gain').then((g) => { if (!g.error) setGain(g); });
      }, [visible, nodeUp, status?.docs]);

      const act = async (label, fn) => {
        setBusy(label); setMessage(null);
        try {
          const r = await fn();
          if (r?.error) setMessage({ kind: 'error', text: r.error });
          await load();
          return r;
        } finally { setBusy(''); }
      };

      const startNode = () => act('node', () => api('/dsh-xerj/node', { action: 'start' }));
      const index = (extra) => act('index', () => api('/dsh-xerj/index', { ...targetBody(), ...extra }));
      const cancel = () => act('cancel', () => api('/dsh-xerj/cancel', { runId: status.activeRun.runId }));
      const installSkill = () => act('skill', async () => {
        const r = await api('/dsh-xerj/setup', { ...targetBody(), action: 'skill' });
        if (!r.error) setMessage({ kind: 'ok', text: 'Wrote ' + (r.wrote || []).join(', ') });
        return r;
      });
      const runInit = (dryRun) => act(dryRun ? 'preview' : 'init', async () => {
        const r = await api('/dsh-xerj/setup', { ...targetBody(), action: 'init', dryRun });
        setInitOutput(r.output || r.error || '');
        return r;
      });

      const openConsole = () => {
        const url = status?.node?.consoleUrl;
        if (!url) return;
        if (sidebarRight?.openTab) {
          try { sidebarRight.openTab('browser', { params: { url } }); return; } catch {}
        }
        window.open(url, '_blank', 'noopener');
      };

      const applyPath = () => {
        const p = pathDraft.trim();
        setOverride(p);
      };

      if (!status) {
        return h("div", { style: { padding: 14, fontSize: 12, opacity: 0.8 } },
          message ? message.text : "Loading XERJ…");
      }

      const ws = status.workspace || {};
      const node = status.node || {};
      const [nodeText, nodeColor] = NODE_LABEL[status.nodeStatus] || [status.nodeStatus, '#94a3b8'];
      const run = status.activeRun;
      const setup = status.setup || {};
      const others = (status.workspaces || []).filter((w) => w.root !== ws.root);

      return h("div", { style: { padding: 14, height: "100%", overflowY: "auto", color: "var(--dsh-text, #e2e8f0)", boxSizing: "border-box" } },
        message && h("div", { style: { ...cardStyle, borderColor: message.kind === 'error' ? '#ef4444' : '#10b981', whiteSpace: 'pre-wrap' } }, message.text),

        // Workspace
        h(Section, { title: "Workspace", right: override ? h("button", { style: btnStyle, onClick: () => { setOverride(''); setPathDraft(''); } }, "Use session folder") : null },
          h("div", { style: { fontSize: 14, fontWeight: 600, marginBottom: 2 } }, ws.name || '—'),
          h("div", { style: { fontSize: 11, opacity: 0.7, fontFamily: "monospace", wordBreak: "break-all", marginBottom: 6 } }, ws.root || target || 'No folder'),
          h(Row, { label: "Source", value: override ? "picked manually" : (sessionCwd ? "this conversation" : "dsh start folder") }),
          ws.isGit ? h(Row, { label: "Git", value: (ws.branch || 'detached') }) : h(Row, { label: "Git", value: "not a repository" }),
          h(Row, { label: "Index prefix", value: (ws.prefix || '') + "-*", mono: true }),
          h("div", { style: { display: "flex", gap: 6, marginTop: 8 } },
            h("input", {
              style: { ...inputStyle, marginBottom: 0 },
              placeholder: "Other folder, e.g. ~/Repo/app",
              value: pathDraft,
              list: "dsh-xerj-workspaces",
              onChange: (e) => setPathDraft(e.target.value),
              onKeyDown: (e) => { if (e.key === 'Enter') applyPath(); }
            }),
            h("datalist", { id: "dsh-xerj-workspaces" }, others.map((w) => h("option", { key: w.root, value: w.root }, w.name))),
            h("button", { style: btnStyle, onClick: applyPath, disabled: !pathDraft.trim() }, "Open")
          ),
          others.length > 0 && h("div", { style: { marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 } },
            others.slice(0, 6).map((w) => h("button", {
              key: w.root, title: w.root,
              style: { ...btnStyle, padding: "3px 8px", fontSize: 11 },
              onClick: () => { setOverride(w.root); setPathDraft(''); }
            }, w.name)))
        ),

        // Engine
        h(Section, { title: "XERJ engine",
          right: h("span", { style: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 500 } },
            h("span", { style: { width: 8, height: 8, borderRadius: "50%", backgroundColor: nodeColor } }), nodeText) },
          h(Row, { label: "Address", value: node.url || status.url, mono: true }),
          node.version && h(Row, { label: "Version", value: node.version }),
          !node.binary && h("div", { style: { fontSize: 12, color: "#ef4444", marginBottom: 6 } },
            "xerj is not installed. Install it from github.com/xerj-org/xerj, then restart dsh."),
          node.disk && node.disk.warn && h("div", { style: { fontSize: 11, color: node.disk.blocked ? "#ef4444" : "#f59e0b", marginBottom: 6 } },
            "Disk " + node.disk.usedPct + "% full (" + node.disk.freeGb + " GB free). " +
            (node.disk.blocked ? "XERJ has stopped accepting writes, so indexing will hang. Free some space first." : "XERJ stops writing at 95%.")),
          node.error && !nodeUp && h("div", { style: { fontSize: 11, color: "#f87171", marginBottom: 6, wordBreak: "break-word" } }, node.error),
          h("div", { style: { display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" } },
            !nodeUp && h("button", { style: primaryBtnStyle, disabled: !node.binary || busy === 'node' || status.nodeStatus === 'starting', onClick: startNode },
              busy === 'node' || status.nodeStatus === 'starting' ? "Starting…" : "Start engine"),
            h("button", { style: btnStyle, disabled: !nodeUp, title: nodeUp ? node.consoleUrl : "Start the engine first", onClick: openConsole },
              h(IconExternal, null), "Open console")
          )
        ),

        // Index
        h(Section, { title: "Project index" },
          status.indexed
            ? h(Row, { label: "Status", value: status.docs + " records in " + status.indices.length + " index" + (status.indices.length === 1 ? "" : "es") })
            : h(Row, { label: "Status", value: nodeUp ? "Not indexed yet" : "Engine not running" }),
          status.lastSummary?.indexedAt && h(Row, { label: "Last run", value: new Date(status.lastSummary.indexedAt).toLocaleString() }),

          run && run.status === 'running' && h("div", { style: { marginTop: 6 } },
            h("div", { style: { fontSize: 12, marginBottom: 4, display: "flex", justifyContent: "space-between" } },
              h("span", null, run.phase || 'indexing'),
              h("span", null, (run.pct != null ? Math.round(run.pct) + "%" : "") + (run.eta ? " · " + run.eta : ""))),
            h("div", { style: { height: 6, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 3, overflow: "hidden" } },
              h("div", { style: { height: "100%", width: (run.pct ?? 5) + "%", backgroundColor: "#3b82f6", transition: "width .3s" } })),
            run.stalledFor > 30 && h("div", { style: { fontSize: 11, color: "#f59e0b", marginTop: 4 } },
              "No progress for " + Math.round(run.stalledFor) + "s." + (node.disk?.warn ? " The disk is nearly full, which is the usual cause." : " Check the node log: " + (node.logFile || "")))),

          run && run.status === 'needs-decision' && h("div", { style: { marginTop: 6, fontSize: 12 } },
            h("div", { style: { color: "#f59e0b", marginBottom: 6 } },
              run.decision?.message || ("This project looks big" + (run.decision?.estimate ? " (" + run.decision.estimate + ")" : "") + ". How should XERJ index it?")),
            h("div", { style: { display: "flex", gap: 6 } },
              h("button", { style: primaryBtnStyle, onClick: () => index({ approve: 'proceed' }) }, "Full"),
              h("button", { style: btnStyle, onClick: () => index({ approve: 'fast' }) }, "Fast (no embeddings)"),
              h("button", { style: btnStyle, onClick: () => index({ approve: 'cancel' }) }, "Skip"))),

          run && run.status === 'failed' && h("div", { style: { marginTop: 6, fontSize: 11, color: "#f87171", whiteSpace: "pre-wrap" } },
            "Last run failed: " + (run.error || (run.tail || []).join("\n"))),

          h("div", { style: { display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" } },
            run && run.status === 'running'
              ? h("button", { style: btnStyle, onClick: cancel }, "Cancel")
              : h("button", { style: primaryBtnStyle, disabled: !node.binary || busy === 'index' || !ws.exists, onClick: () => index({}) },
                  status.indexed ? "Update index" : "Index this project"),
            status.indexed && !(run && run.status === 'running') &&
              h("button", { style: btnStyle, disabled: busy === 'index', onClick: () => index({ fresh: true }) }, "Rebuild from scratch"))
        ),

        // Setup
        h(Section, { title: "Project setup" },
          h(Check, { on: setup.dshSkill, label: "XERJ skill for DSH (.agents/skills/xerj)" }),
          h(Check, { on: setup.mcpJson, label: ".mcp.json registers xerj (other agents)" }),
          h(Check, { on: setup.agentsMd, label: "AGENTS.md mentions XERJ" }),
          h("div", { style: { display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" } },
            h("button", { style: btnStyle, disabled: busy === 'skill' || !ws.exists, onClick: installSkill }, setup.dshSkill ? "Reinstall skill" : "Install skill"),
            h("button", { style: btnStyle, disabled: !node.binary || busy === 'preview' || !ws.exists, onClick: () => runInit(true) }, "Preview xerj init"),
            h("button", { style: btnStyle, disabled: !node.binary || busy === 'init' || !ws.exists, onClick: () => {
              if (window.confirm('Run "xerj init" in ' + ws.root + '?\nIt writes .mcp.json, .claude/skills/xerj and AGENTS.md (with .bak backups).')) runInit(false);
            } }, "Run xerj init")),
          h("div", { style: { fontSize: 11, opacity: 0.65, marginTop: 6 } },
            "DSH already has the XERJ tools through this plugin. xerj init is only needed for Claude Code, Cursor or other agents in this repo."),
          initOutput && h("pre", { style: { fontSize: 10.5, whiteSpace: "pre-wrap", background: "rgba(0,0,0,0.25)", padding: 8, borderRadius: 6, marginTop: 8, maxHeight: 220, overflow: "auto" } }, initOutput)
        ),

        gain && gain.searches != null && h(Section, { title: "Usage" },
          h(Row, { label: "Searches", value: String(gain.searches) }),
          h(Row, { label: "Hit rate", value: gain.hit_rate != null ? gain.hit_rate.toFixed(1) + "%" : "–" }),
          gain.took_ms && h(Row, { label: "Latency p50 / p95", value: gain.took_ms.p50 + " / " + gain.took_ms.p95 + " ms" }))
      );
    }

    // Tool View: Search Row
    function SearchToolRow({ block, openFile }) {
      const results = Array.isArray(block?.result) ? block.result : (block?.result?.hits || []);
      return h("div", { style: { fontSize: 12, padding: "4px 0" } },
        results.slice(0, 5).map((hit, idx) => {
          const file = hit.file || hit._source?.path || hit.path || 'unknown';
          const line = hit.line || hit._source?.line || 1;
          const snippet = hit.passage || hit.snippet || hit._source?.content || '';
          return h("div", {
            key: idx,
            style: {
              padding: "6px 8px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              cursor: openFile ? "pointer" : "default"
            },
            onClick: () => openFile && openFile(file, line)
          },
            h("div", { style: { color: "#60a5fa", fontWeight: 500, display: "flex", alignItems: "center", gap: 4 } },
              h(IconSearch, { width: 12, height: 12 }),
              file + ":" + line
            ),
            snippet && h("div", {
              style: {
                opacity: 0.8,
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontFamily: "monospace"
              }
            }, snippet)
          );
        })
      );
    }

    // Tool View: Def Row
    function DefToolRow({ block, openFile }) {
      const items = Array.isArray(block?.result) ? block.result : [];
      return h("div", { style: { fontSize: 12, padding: "4px 0" } },
        items.map((item, idx) => {
          const file = item.file || 'unknown';
          const line = item.line || 1;
          const sig = item.signature || item.name || '';
          return h("div", {
            key: idx,
            style: { padding: "4px 8px", cursor: openFile ? "pointer" : "default" },
            onClick: () => openFile && openFile(file, line)
          },
            h("div", { style: { display: "flex", justifyContent: "space-between" } },
              h("span", { style: { color: "#a78bfa", fontWeight: 500 } }, file + ":" + line),
              item.kind && h("span", { style: { opacity: 0.6, fontSize: 10 } }, item.kind)
            ),
            sig && h("code", { style: { display: "block", background: "rgba(0,0,0,0.2)", padding: "2px 4px", borderRadius: 4, marginTop: 2 } }, sig)
          );
        })
      );
    }

    // Tool View: Autoindex Row
    function AutoindexToolRow({ block }) {
      const isDone = block?.phase === 'result' || block?.result?.status === 'done';
      const summary = block?.result?.summary;
      const records = summary?.records ?? 0;

      return h("div", { style: { fontSize: 12, padding: "4px 8px" } },
        isDone
          ? h("div", { style: { color: "#34d399", display: "flex", alignItems: "center", gap: 6 } },
              h("span", null, "✓"),
              h("span", null, "Indexed " + records + " documents (" + (summary?.wall ?? 'completed') + ")")
            )
          : h("div", { style: { opacity: 0.8 } }, "Autoindex operation active...")
      );
    }

    // Settings Page Component (Registered in Plugins Settings)
    function XerjSettingsForm({ view, form }) {
      if (view === 'summary') {
        return h("span", null, "AI-native code search engine, background autoindex runner, and interactive visual cards.");
      }

      const [cfg, setCfg] = useState({
        url: "http://127.0.0.1:9200",
        managedPort: 9200,
        manageNode: true,
        insecure: true,
        keepFresh: true,
        keepFreshDebounceMs: 20000,
        maxMinutes: 10,
        ui: { toolCards: true, sidebarPanel: true, consoleTab: true }
      });
      const [saved, setSaved] = useState(false);

      useEffect(() => {
        fetch('/dsh-xerj/config')
          .then(r => r.json())
          .then(data => {
            if (data.config) setCfg(data.config);
          })
          .catch(() => {});
      }, []);

      const save = async () => {
        try {
          if (form?.mutate) {
            await form.mutate([
              { op: 'set', path: ['url'], value: cfg.url },
              { op: 'set', path: ['managedPort'], value: Number(cfg.managedPort) },
              { op: 'set', path: ['manageNode'], value: Boolean(cfg.manageNode) },
              { op: 'set', path: ['insecure'], value: Boolean(cfg.insecure) },
              { op: 'set', path: ['keepFresh'], value: Boolean(cfg.keepFresh) },
              { op: 'set', path: ['keepFreshDebounceMs'], value: Number(cfg.keepFreshDebounceMs) },
              { op: 'set', path: ['maxMinutes'], value: Number(cfg.maxMinutes) },
              { op: 'set', path: ['ui', 'toolCards'], value: Boolean(cfg.ui?.toolCards) },
              { op: 'set', path: ['ui', 'sidebarPanel'], value: Boolean(cfg.ui?.sidebarPanel) },
              { op: 'set', path: ['ui', 'consoleTab'], value: Boolean(cfg.ui?.consoleTab) }
            ]);
          }
          await fetch('/dsh-xerj/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cfg)
          });
          setSaved(true);
          setTimeout(() => setSaved(false), 2500);
        } catch (e) {
          console.error('[dsh-xerj] failed to save settings:', e);
        }
      };

      return h("div", { style: { padding: 16, maxWidth: 640, color: "var(--dsh-text, #e2e8f0)" } },
        h("h3", { style: { marginBottom: 12, fontSize: 16 } }, "XERJ Search Engine Configuration"),

        // Node Section
        h("div", { style: cardStyle },
          h("div", { style: { fontWeight: 600, marginBottom: 8 } }, "Node & Connectivity"),
          h("label", { style: { fontSize: 12, display: "block", marginBottom: 4 } }, "Node URL:"),
          h("input", {
            style: inputStyle,
            value: cfg.url || '',
            onChange: e => setCfg({ ...cfg, url: e.target.value })
          }),
          h("label", { style: { fontSize: 12, display: "block", marginBottom: 4 } }, "Managed Port:"),
          h("input", {
            style: inputStyle,
            type: "number",
            value: cfg.managedPort || 9200,
            onChange: e => setCfg({ ...cfg, managedPort: parseInt(e.target.value, 10) })
          }),
          h("label", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginTop: 4 } },
            h("input", {
              type: "checkbox",
              checked: cfg.manageNode !== false,
              onChange: e => setCfg({ ...cfg, manageNode: e.target.checked })
            }),
            "Auto-spawn local XERJ node if none is running"
          ),
          h("label", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginTop: 6 } },
            h("input", {
              type: "checkbox",
              checked: cfg.insecure !== false,
              onChange: e => setCfg({ ...cfg, insecure: e.target.checked })
            }),
            "Insecure dev mode (loopback-only without TLS/auth)"
          )
        ),

        // Indexing Section
        h("div", { style: cardStyle },
          h("div", { style: { fontWeight: 600, marginBottom: 8 } }, "Auto-Indexing Policies"),
          h("label", { style: { fontSize: 12, display: "block", marginBottom: 4 } }, "Max Minutes Estimate Gate:"),
          h("input", {
            style: inputStyle,
            type: "number",
            value: cfg.maxMinutes ?? 10,
            onChange: e => setCfg({ ...cfg, maxMinutes: parseInt(e.target.value, 10) })
          }),
          h("label", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginTop: 4 } },
            h("input", {
              type: "checkbox",
              checked: cfg.keepFresh !== false,
              onChange: e => setCfg({ ...cfg, keepFresh: e.target.checked })
            }),
            "Auto-reindex project on agent file modifications (Keep Fresh)"
          )
        ),

        // UI Section
        h("div", { style: cardStyle },
          h("div", { style: { fontWeight: 600, marginBottom: 8 } }, "UI & Visual Features"),
          h("label", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginTop: 4 } },
            h("input", {
              type: "checkbox",
              checked: cfg.ui?.toolCards !== false,
              onChange: e => setCfg({ ...cfg, ui: { ...cfg.ui, toolCards: e.target.checked } })
            }),
            "Rich interactive chat cards (Search, Go-To-Def, Autoindex)"
          ),
          h("label", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginTop: 6 } },
            h("input", {
              type: "checkbox",
              checked: cfg.ui?.sidebarPanel !== false,
              onChange: e => setCfg({ ...cfg, ui: { ...cfg.ui, sidebarPanel: e.target.checked } })
            }),
            "XERJ Right Sidebar Tab (Compatible with Better Sidebar & Native Sidebar)"
          ),
          h("label", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginTop: 6 } },
            h("input", {
              type: "checkbox",
              checked: cfg.ui?.consoleTab !== false,
              onChange: e => setCfg({ ...cfg, ui: { ...cfg.ui, consoleTab: e.target.checked } })
            }),
            "Open XERJ Web Console in Sidebar Browser Tab"
          )
        ),

        // Save Button & Toast
        h("div", { style: { display: "flex", alignItems: "center", gap: 12, marginTop: 12 } },
          h("button", { style: primaryBtnStyle, onClick: save }, "Save Settings"),
          saved && h("span", { style: { color: "#10b981", fontSize: 12 } }, "✓ Settings saved!")
        )
      );
    }

    // Cordis Apply Wiring
    exports.name = NS;
    exports.inject = ["slots", "locale", "sidebarRight"];

    exports.apply = function(ctx) {
      if (ctx.locale?.register) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-xerj: dictionaries");
      }

      // 1. Synchronously register Tool Cards in tool.call.toolview
      if (ctx.slots?.inject) {
        ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
          name: "tool.call.toolview",
          key: "mcp__xerj__xerj_search",
          locale: NS
        }, SearchToolRow));

        ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
          name: "tool.call.toolview",
          key: "xerj_def",
          locale: NS
        }, DefToolRow));

        ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
          name: "tool.call.toolview",
          key: "xerj_autoindex",
          locale: NS
        }, AutoindexToolRow));

        // 2. Synchronously register Settings Form in Plugins Settings
        ctx.slots.inject("plugins.row.config", () => ctx.slots.register({
          name: "plugins.row.config",
          key: "dsh-xerj#xerj",
          locale: NS
        }, XerjSettingsForm));

        ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
          name: "plugins.bundle.config",
          key: "dsh-xerj",
          locale: NS
        }, XerjSettingsForm));
      }

      // 3. Register Sidebar Tab: Seamlessly handles BOTH Better Sidebar AND Native Right Sidebar
      let betterSidebarRegistered = false;

      ctx.inject(["betterSidebar"], (bCtx) => {
        betterSidebarRegistered = true;
        bCtx.effect(() => bCtx.betterSidebar.registerTab({
          id: "xerj:panel",
          title: () => "XERJ",
          order: 45,
          single: true,
          icon: (size) => h(IconSearch, { width: size || 16, height: size || 16 }),
          component: (props) => h(XerjPanel, {
            scope: props.scope,
            sidebarRight: ctx.sidebarRight,
            visible: props.visible
          })
        }), "dsh-xerj: betterSidebar tab");
      });

      ctx.inject(["sidebarRightTabs"], (sCtx) => {
        if (betterSidebarRegistered) return;
        sCtx.effect(() => sCtx.sidebarRightTabs.register({
          id: "dsh-xerj",
          kind: "xerj",
          title: () => "XERJ",
          guide: [{
            id: "panel",
            order: 45,
            title: () => "XERJ",
            description: () => "AI-native code search and project index monitor",
            icon: (props) => h(IconSearch, props)
          }]
        }), "dsh-xerj: sidebarRightTabs");
      });

      // Native fallback slot registration
      if (ctx.slots?.inject) {
        ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
          name: "sidebar.right.pane.tab",
          key: "dsh-xerj",
          locale: NS
        }, (props) => h(XerjPanel, {
          scope: props.scope,
          sidebarRight: ctx.sidebarRight,
          visible: props.visible
        })));
      }
    };

    return module.exports;
  }
});
