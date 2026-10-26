#!/usr/bin/env node
// Adds (or removes) the Agent Office hooks in Claude Code settings.
//
//   node install.js /path/to/project              -> <project>/.claude/settings.local.json
//                                                    (read by EVERY profile that opens this project)
//   node install.js --global                      -> settings.json of the profile in $CLAUDE_CONFIG_DIR,
//                                                    or ~/.claude when it is unset
//   node install.js --profile ~/.claude-diky      -> that profile's settings.json (repeatable)
//   node install.js --all-profiles                -> ~/.claude and every ~/.claude-* profile
//   add --uninstall to remove, --dry-run to only print the target files
//
// settings.local.json is used for projects because the hook path is specific to
// this machine, and that file is not meant to be committed.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, 'hooks', 'send-event.sh');
const MARK = 'agent-office/hooks/send-event.sh';
const EVENTS = [
  'SessionStart', 'SessionEnd', 'UserPromptSubmit',
  'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
  'Notification', 'Stop', 'SubagentStart', 'SubagentStop', 'PreCompact',
];
const TOOL_EVENTS = new Set(['PreToolUse', 'PostToolUse', 'PostToolUseFailure']);

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const uninstall = flag('--uninstall');
const dryRun = flag('--dry-run');
const expand = (p) => path.resolve(p.replace(/^~(?=$|\/)/, os.homedir()));

// a Claude config dir looks like one if it has settings or session data in it
const NOT_PROFILES = new Set(['.claude-mem']); // plugin data dirs that only look like profiles
const isProfile = (dir) =>
  !NOT_PROFILES.has(path.basename(dir)) && ['settings.json', '.claude.json', 'projects'].some((f) => fs.existsSync(path.join(dir, f)));

const profiles = [];
argv.forEach((a, i) => a === '--profile' && argv[i + 1] && profiles.push(expand(argv[i + 1])));
if (flag('--global')) profiles.push(expand(process.env.CLAUDE_CONFIG_DIR || '~/.claude'));
if (flag('--all-profiles')) {
  const home = os.homedir();
  for (const name of fs.readdirSync(home)) {
    const dir = path.join(home, name);
    if ((name === '.claude' || name.startsWith('.claude-')) && fs.statSync(dir).isDirectory() && isProfile(dir)) profiles.push(dir);
  }
}

const positional = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--profile');
const targets = profiles.length
  ? [...new Set(profiles)].map((d) => path.join(d, 'settings.json'))
  : [path.join(path.resolve(positional[0] || process.cwd()), '.claude', 'settings.local.json')];

const isOurs = (h) => typeof h?.command === 'string' && h.command.includes(MARK);

function apply(target) {
  let settings = {};
  let raw = null;
  if (fs.existsSync(target)) {
    raw = fs.readFileSync(target, 'utf8');
    try {
      settings = raw.trim() ? JSON.parse(raw) : {};
    } catch (e) {
      console.error(`✗ ${target} bukan JSON valid, dilewati: ${e.message}`);
      return;
    }
  }
  settings.hooks = settings.hooks || {};

  // always strip our previous entries first, so re-running is idempotent
  for (const ev of Object.keys(settings.hooks)) {
    const groups = (settings.hooks[ev] || [])
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h)) }))
      .filter((g) => g.hooks.length);
    if (groups.length) settings.hooks[ev] = groups;
    else delete settings.hooks[ev];
  }
  if (!uninstall) {
    for (const ev of EVENTS) {
      const group = { hooks: [{ type: 'command', command: `"${HOOK}"`, async: true, timeout: 5 }] };
      if (TOOL_EVENTS.has(ev)) group.matcher = '*';
      (settings.hooks[ev] = settings.hooks[ev] || []).push(group);
    }
  }
  if (!Object.keys(settings.hooks).length) delete settings.hooks;

  if (dryRun) return console.log(`• ${target} (dry-run, tidak diubah)`);
  if (raw !== null) fs.writeFileSync(`${target}.agent-office.bak`, raw);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(settings, null, 2) + '\n');
  console.log(`✓ ${uninstall ? 'Dihapus dari' : 'Dipasang di'} ${target}`);
}

if (!uninstall && !dryRun) fs.chmodSync(HOOK, 0o755);
targets.forEach(apply);

if (!uninstall && !dryRun) {
  console.log('\nLangkah berikutnya:');
  console.log(`  1. node ${path.join(__dirname, 'server.js')} --open`);
  console.log('  2. Buka sesi claude baru (hook dibaca saat sesi dimulai)');
}
