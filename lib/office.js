// Office state: turns raw Claude Code hook payloads into per-agent state
// that the 3D client can animate. Pure-ish: no I/O, just a Map + timers.

const path = require('node:path');

const LEAD_NAMES = ['Kapten', 'Nakhoda', 'Komandan', 'Ketua', 'Bos'];
const SUB_NAMES = [
  'Mochi', 'Bakso', 'Cilok', 'Tempe', 'Onde', 'Klepon', 'Seblak',
  'Cireng', 'Dodol', 'Lumpia', 'Serabi', 'Martabak', 'Getuk', 'Wingko',
];
const SPECIES = ['cat', 'bear', 'bunny', 'frog', 'robot', 'panda'];
const PALETTE = ['#ff8a3d', '#7c5cff', '#2bb3a3', '#ff5c8a', '#3d8bff', '#f2c230', '#62c454', '#e0533d'];

const HISTORY_LIMIT = 60;
const IDLE_AFTER_MS = 45_000; // no events while "busy" -> idle
const REPORT_MS = 4_500; // subagent reporting back to lead
const BRIEFING_MS = 3_500; // subagent getting briefed by lead
const DONE_LINGER_MS = 75_000; // finished subagent hangs around before leaving
const OFFLINE_LINGER_MS = 8_000;
const STALE_MS = 30 * 60_000;

// tool name -> what the character visibly does
function toolToActivity(tool) {
  if (!tool) return 'thinking';
  if (/^(Read|NotebookRead)$/.test(tool)) return 'reading';
  if (/^(Grep|Glob|LS|ToolSearch)$/.test(tool)) return 'searching';
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) return 'typing';
  if (/^(Bash|BashOutput|KillShell|KillBash|Monitor|TaskStop)$/.test(tool)) return 'terminal';
  if (/^(WebFetch|WebSearch)$/.test(tool) || /browser|chrome|playwright|fetch/i.test(tool)) return 'browsing';
  if (/^(TodoWrite|TaskCreate|TaskUpdate|TaskList|TaskGet|EnterPlanMode|ExitPlanMode)$/.test(tool)) return 'planning';
  if (/^(Agent|Task)$/.test(tool)) return 'delegating';
  if (/^SendMessage$/.test(tool)) return 'talking';
  if (/^AskUserQuestion$/.test(tool)) return 'asking';
  if (/^Skill$/.test(tool)) return 'reading';
  if (tool.startsWith('mcp__')) return 'browsing';
  return 'typing';
}

const clip = (s, n = 90) => {
  if (s == null) return '';
  s = String(s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};
const base = (p) => (p ? path.basename(String(p)) : '');

// one human-readable line describing a tool call
function describeTool(tool, input = {}) {
  switch (tool) {
    case 'Read': return `Membaca ${base(input.file_path)}`;
    case 'Edit': case 'MultiEdit': return `Mengedit ${base(input.file_path)}`;
    case 'Write': return `Menulis ${base(input.file_path)}`;
    case 'NotebookEdit': return `Mengedit notebook ${base(input.notebook_path)}`;
    case 'Grep': return `Mencari "${clip(input.pattern, 40)}"`;
    case 'Glob': return `Mencari file ${clip(input.pattern, 40)}`;
    case 'Bash': return clip(input.description || `$ ${input.command}`, 80);
    case 'WebSearch': return `Googling "${clip(input.query, 50)}"`;
    case 'WebFetch': {
      try { return `Membuka ${new URL(input.url).host}`; } catch { return 'Membuka web'; }
    }
    case 'TodoWrite': return `Menyusun ${(input.todos || []).length} to-do`;
    case 'Agent': case 'Task': return `Mendelegasikan: ${clip(input.description || input.prompt, 60)}`;
    case 'SendMessage': return `Kirim pesan ke ${input.to || input.recipient || 'tim'}`;
    case 'AskUserQuestion': return 'Bertanya ke kamu';
    case 'Skill': return `Memakai skill ${input.skill || ''}`;
    default: return tool?.startsWith('mcp__') ? tool.split('__').slice(1).join(' › ') : (tool || '');
  }
}

function hash(str) {
  let h = 2166136261;
  for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

class Office {
  constructor({ onChange } = {}) {
    this.agents = new Map();
    this.feed = []; // global activity ticker
    this.pendingSpawns = new Map(); // sessionId -> [{description, subagent_type}]
    this.onChange = onChange || (() => {});
    this.tick = setInterval(() => this.sweep(), 1000);
    this.tick.unref?.();
  }

  usedNames() {
    return new Set([...this.agents.values()].map((a) => a.name));
  }

  pickName(list, seed) {
    const used = this.usedNames();
    const start = hash(seed) % list.length;
    for (let i = 0; i < list.length; i++) {
      const n = list[(start + i) % list.length];
      if (!used.has(n)) return n;
    }
    return `${list[start]} ${used.size}`;
  }

  ensureLead(p) {
    const id = `s:${p.session_id || 'default'}`;
    let a = this.agents.get(id);
    if (!a) {
      a = this.makeAgent(id, {
        kind: 'lead',
        name: this.pickName(LEAD_NAMES, id),
        role: 'Team Lead',
        sessionId: p.session_id,
        species: 'fox',
        color: '#1f2433',
      });
    }
    if (p.cwd) {
      a.cwd = p.cwd;
      a.project = base(p.cwd);
    }
    // which Claude profile (CLAUDE_CONFIG_DIR) the session runs under, e.g. ".claude-diky"
    const prof = /\/(\.claude[^/]*)\/projects\//.exec(p.transcript_path || '');
    if (prof) a.profile = prof[1] === '.claude' ? 'default' : prof[1].replace(/^\.claude-/, '');
    return a;
  }

  ensureSub(p) {
    const id = `a:${p.agent_id}`;
    let a = this.agents.get(id);
    if (!a) {
      const lead = this.ensureLead(p);
      const h = hash(id);
      a = this.makeAgent(id, {
        kind: 'sub',
        name: this.pickName(SUB_NAMES, id),
        role: p.agent_type || 'subagent',
        sessionId: p.session_id,
        parentId: lead.id,
        species: SPECIES[h % SPECIES.length],
        color: PALETTE[(h >> 4) % PALETTE.length],
        cwd: lead.cwd,
        project: lead.project,
        profile: lead.profile,
      });
    }
    return a;
  }

  makeAgent(id, props) {
    const now = Date.now();
    const a = {
      id,
      parentId: null,
      cwd: '',
      project: '',
      state: 'idle',
      activity: 'idle',
      detail: '',
      tool: null,
      task: '',
      talkingTo: null,
      bubble: null,
      startedAt: now,
      lastEventAt: now,
      stateSince: now,
      stats: { tools: {}, toolCalls: 0, errors: 0 },
      history: [],
      ...props,
    };
    this.agents.set(id, a);
    return a;
  }

  // the agent a hook payload belongs to: subagent if agent_id is present, else the session lead
  resolve(p) {
    return p.agent_id ? this.ensureSub(p) : this.ensureLead(p);
  }

  setState(a, state, extra = {}) {
    if (a.state !== state) a.stateSince = Date.now();
    a.state = state;
    Object.assign(a, extra);
  }

  say(a, text, ms = 4000) {
    a.bubble = text ? { text: clip(text, 110), until: Date.now() + ms } : null;
  }

  log(a, type, text) {
    const entry = { t: Date.now(), type, text: clip(text, 160) };
    a.history.unshift(entry);
    if (a.history.length > HISTORY_LIMIT) a.history.length = HISTORY_LIMIT;
    this.feed.unshift({ ...entry, agent: a.name, agentId: a.id });
    if (this.feed.length > 40) this.feed.length = 40;
  }

  findByName(sessionId, who) {
    if (!who) return null;
    const w = String(who).toLowerCase();
    for (const a of this.agents.values()) {
      if (a.sessionId !== sessionId) continue;
      if ([a.name, a.role, a.id, a.id.slice(2)].some((v) => String(v).toLowerCase() === w)) return a;
    }
    return null;
  }

  handle(p) {
    if (!p || typeof p !== 'object') return;
    const ev = p.hook_event_name;
    const now = Date.now();

    switch (ev) {
      case 'SessionStart': {
        const a = this.ensureLead(p);
        this.setState(a, 'idle', { activity: 'idle', detail: 'Siap kerja', talkingTo: null });
        this.say(a, 'Halo! Siap kerja 👋');
        this.log(a, 'session', `Sesi dimulai (${p.source || 'startup'})`);
        break;
      }
      case 'UserPromptSubmit': {
        const a = this.ensureLead(p);
        a.task = clip(p.prompt, 200);
        this.setState(a, 'thinking', { activity: 'thinking', detail: 'Memikirkan permintaanmu', talkingTo: null });
        this.say(a, 'Hmm, oke… 🤔', 3000);
        this.log(a, 'prompt', `Tugas baru: ${p.prompt}`);
        break;
      }
      case 'PreToolUse': {
        const a = this.resolve(p);
        const tool = p.tool_name;
        const input = p.tool_input || {};
        const activity = toolToActivity(tool);
        const detail = describeTool(tool, input);
        if (a.state === 'waiting') this.say(a, null); // permission granted, drop the raised-hand bubble
        a.tool = tool;
        a.stats.toolCalls++;
        a.stats.tools[tool] = (a.stats.tools[tool] || 0) + 1;

        if (activity === 'delegating') {
          const q = this.pendingSpawns.get(p.session_id) || [];
          q.push({ description: input.description || clip(input.prompt, 60), type: input.subagent_type });
          this.pendingSpawns.set(p.session_id, q);
          this.setState(a, 'working', { activity, detail, talkingTo: null });
          this.say(a, `Tim, tolong: ${input.description || 'kerjakan ini'}`, 5000);
        } else if (activity === 'talking') {
          const target = this.findByName(p.session_id, input.to || input.recipient);
          this.setState(a, 'talking', { activity, detail, talkingTo: target?.id || a.parentId });
          this.say(a, input.message || input.content || input.summary || 'Psst…', 5000);
        } else if (activity === 'asking') {
          this.setState(a, 'waiting', { activity, detail, talkingTo: null });
          this.say(a, input.questions?.[0]?.question || 'Aku perlu jawabanmu!', 8000);
        } else {
          this.setState(a, 'working', { activity, detail, talkingTo: null });
        }
        this.log(a, 'tool', detail);
        break;
      }
      case 'PostToolUse': {
        const a = this.resolve(p);
        // between tool calls the model is "thinking" about the result
        if (a.state !== 'talking' || p.tool_name === 'SendMessage') {
          this.setState(a, 'thinking', { activity: 'thinking', talkingTo: null });
        }
        break;
      }
      case 'PostToolUseFailure': {
        const a = this.resolve(p);
        a.stats.errors++;
        this.setState(a, 'thinking', { activity: 'thinking', talkingTo: null });
        this.say(a, 'Waduh, error… coba lagi 😅', 3500);
        this.log(a, 'error', `${p.tool_name} gagal: ${clip(p.error, 100)}`);
        break;
      }
      case 'Notification': {
        const a = this.resolve(p);
        const msg = p.message || 'Butuh perhatianmu';
        // idle reminders are not real "waiting for permission" moments
        if (/waiting for your input|idle/i.test(msg)) {
          this.setState(a, 'idle', { activity: 'idle', detail: 'Menunggu tugas berikutnya', talkingTo: null });
        } else {
          this.setState(a, 'waiting', { activity: 'asking', detail: msg, talkingTo: null });
          this.say(a, `✋ ${msg}`, 12000);
        }
        this.log(a, 'notify', msg);
        break;
      }
      case 'Stop': {
        const a = this.ensureLead(p);
        this.setState(a, 'idle', { activity: 'idle', detail: 'Tugas selesai', tool: null, talkingTo: null });
        this.say(a, 'Beres! ✅', 4000);
        this.log(a, 'done', 'Selesai menjawab');
        break;
      }
      case 'SubagentStart': {
        const a = this.ensureSub(p);
        const q = this.pendingSpawns.get(p.session_id) || [];
        const idx = q.findIndex((s) => !s.type || s.type === p.agent_type);
        const spawn = idx >= 0 ? q.splice(idx, 1)[0] : null;
        a.task = spawn?.description || a.task || `Tugas ${a.role}`;
        this.setState(a, 'talking', { activity: 'briefing', detail: `Dapat tugas: ${a.task}`, talkingTo: a.parentId });
        this.say(a, `Siap! Aku urus "${clip(a.task, 50)}"`, BRIEFING_MS);
        this.log(a, 'spawn', `Bergabung sebagai ${a.role}: ${a.task}`);
        const lead = this.agents.get(a.parentId);
        if (lead) this.setState(lead, 'working', { activity: 'supervising', detail: 'Mengawasi tim' });
        break;
      }
      case 'SubagentStop': {
        const a = p.agent_id ? this.ensureSub(p) : null;
        if (!a) break;
        this.setState(a, 'talking', { activity: 'reporting', detail: 'Melapor ke lead', talkingTo: a.parentId, tool: null });
        this.say(a, `Lapor! "${clip(a.task, 40)}" beres 🎉`, REPORT_MS);
        this.log(a, 'done', `Selesai: ${a.task}`);
        break;
      }
      case 'PreCompact': {
        const a = this.ensureLead(p);
        this.setState(a, 'working', { activity: 'planning', detail: 'Merapikan ingatan (compact)' });
        this.log(a, 'compact', 'Merangkum konteks');
        break;
      }
      case 'SessionEnd': {
        const a = this.ensureLead(p);
        this.setState(a, 'offline', { activity: 'leaving', detail: 'Pulang', talkingTo: null });
        this.say(a, 'Dadah! 👋', 3000);
        this.log(a, 'session', 'Sesi berakhir');
        for (const s of this.agents.values()) {
          if (s.parentId === a.id) this.setState(s, 'offline', { activity: 'leaving' });
        }
        break;
      }
      default:
        return;
    }
    for (const a of this.agents.values()) if (a.sessionId === p.session_id) a.lastEventAt = now;
    this.onChange();
  }

  // time-based transitions: idle timeout, reports finishing, leaving the office
  sweep() {
    const now = Date.now();
    let changed = false;
    for (const a of [...this.agents.values()]) {
      const inState = now - a.stateSince;
      if (a.bubble && a.bubble.until < now) {
        a.bubble = null;
        changed = true;
      }
      if (a.activity === 'briefing' && inState > BRIEFING_MS) {
        this.setState(a, 'thinking', { activity: 'thinking', talkingTo: null, detail: a.task });
        changed = true;
      } else if (a.activity === 'reporting' && inState > REPORT_MS) {
        this.setState(a, 'done', { activity: 'celebrating', talkingTo: null, detail: 'Tugas selesai 🎉' });
        changed = true;
      } else if (a.state === 'done' && inState > DONE_LINGER_MS) {
        this.setState(a, 'offline', { activity: 'leaving' });
        changed = true;
      } else if (a.state === 'offline' && inState > OFFLINE_LINGER_MS) {
        this.agents.delete(a.id);
        changed = true;
      } else if (['working', 'thinking', 'talking'].includes(a.state) && now - a.lastEventAt > IDLE_AFTER_MS) {
        this.setState(a, 'idle', { activity: 'idle', talkingTo: null, detail: 'Santai dulu ☕' });
        changed = true;
      } else if (now - a.lastEventAt > STALE_MS && a.state !== 'offline') {
        this.setState(a, 'offline', { activity: 'leaving' });
        changed = true;
      }
    }
    if (changed) this.onChange();
  }

  reset() {
    this.agents.clear();
    this.feed = [];
    this.pendingSpawns.clear();
    this.onChange();
  }

  snapshot() {
    return {
      now: Date.now(),
      agents: [...this.agents.values()],
      feed: this.feed.slice(0, 20),
    };
  }
}

module.exports = { Office, toolToActivity, describeTool };
