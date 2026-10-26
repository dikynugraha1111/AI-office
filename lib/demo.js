// Fake multi-agent session: emits the same hook payloads Claude Code would send,
// so the whole pipeline (reducer -> SSE -> 3D) can be seen without running agents.

function runDemo(office, { loop = false } = {}) {
  const session_id = `demo-${Date.now().toString(36)}`;
  const cwd = '/Users/kamu/projects/toko-online';
  const timers = [];
  let t = 0;

  const send = (delay, payload) => {
    t += delay;
    timers.push(setTimeout(() => office.handle({ session_id, cwd, ...payload }), t));
  };
  const tool = (delay, agent, tool_name, tool_input, holdMs = 1200) => {
    send(delay, { hook_event_name: 'PreToolUse', tool_name, tool_input, ...agent });
    send(holdMs, { hook_event_name: 'PostToolUse', tool_name, tool_input, ...agent });
  };

  const R = { agent_id: 'demo-research', agent_type: 'Explore' };
  const W = { agent_id: 'demo-web', agent_type: 'frontend-dev' };
  const Q = { agent_id: 'demo-qa', agent_type: 'tester' };
  const lead = {};

  send(300, { hook_event_name: 'SessionStart', source: 'startup' });
  send(2500, { hook_event_name: 'UserPromptSubmit', prompt: 'Tambahkan fitur checkout dengan diskon voucher, lalu tes semuanya' });
  tool(2500, lead, 'Read', { file_path: `${cwd}/src/cart/Cart.tsx` }, 2500);
  tool(800, lead, 'Grep', { pattern: 'applyDiscount' }, 2000);
  tool(800, lead, 'TodoWrite', { todos: [1, 2, 3, 4] }, 3500);

  // lead fans out to three subagents
  send(800, { hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { description: 'Riset API voucher', subagent_type: 'Explore' } });
  send(300, { hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { description: 'Bikin UI checkout', subagent_type: 'frontend-dev' } });
  send(300, { hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { description: 'Tulis test checkout', subagent_type: 'tester' } });
  send(900, { hook_event_name: 'SubagentStart', ...R });
  send(1200, { hook_event_name: 'SubagentStart', ...W });
  send(1200, { hook_event_name: 'SubagentStart', ...Q });

  // research
  tool(3000, R, 'Glob', { pattern: 'src/**/voucher*' }, 1800);
  tool(400, R, 'WebSearch', { query: 'midtrans voucher discount api' }, 4000);
  tool(300, W, 'Read', { file_path: `${cwd}/src/checkout/Checkout.tsx` }, 2500);
  tool(300, Q, 'Glob', { pattern: 'tests/**/*.spec.ts' }, 1500);
  tool(300, R, 'WebFetch', { url: 'https://docs.midtrans.com/reference/voucher' }, 4500);
  tool(300, W, 'Write', { file_path: `${cwd}/src/checkout/VoucherInput.tsx` }, 6000);
  tool(300, Q, 'Write', { file_path: `${cwd}/tests/checkout.spec.ts` }, 5000);

  // research tells the web dev what it found
  send(500, { hook_event_name: 'PreToolUse', tool_name: 'SendMessage', tool_input: { to: 'frontend-dev', message: 'Endpoint voucher ada di /v2/promo, butuh header X-Promo-Key ya!' }, ...R });
  send(5500, { hook_event_name: 'PostToolUse', tool_name: 'SendMessage', ...R });
  send(200, { hook_event_name: 'SubagentStop', ...R });

  tool(1500, W, 'Edit', { file_path: `${cwd}/src/checkout/Checkout.tsx` }, 4500);
  tool(300, Q, 'Bash', { command: 'npm test -- checkout', description: 'Jalankan test checkout' }, 6000);
  send(300, { hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', error: '1 test failed: voucher expired case', ...Q });
  tool(1200, Q, 'Edit', { file_path: `${cwd}/tests/checkout.spec.ts` }, 3000);
  tool(300, W, 'Bash', { command: 'npm run lint', description: 'Cek lint' }, 3000);

  // permission prompt -> the agent raises its hand
  send(800, { hook_event_name: 'Notification', message: 'Claude needs your permission to use Bash', ...Q });
  tool(6000, Q, 'Bash', { command: 'npm test', description: 'Jalankan semua test' }, 5000);
  send(300, { hook_event_name: 'SubagentStop', ...W });
  send(2500, { hook_event_name: 'SubagentStop', ...Q });

  tool(5000, lead, 'Read', { file_path: `${cwd}/src/checkout/Checkout.tsx` }, 2500);
  tool(400, lead, 'Edit', { file_path: `${cwd}/CHANGELOG.md` }, 2500);
  send(500, { hook_event_name: 'Stop' });

  if (loop) timers.push(setTimeout(() => {
    office.handle({ session_id, cwd, hook_event_name: 'SessionEnd' });
  }, t + 70_000));

  return {
    duration: t,
    stop: () => timers.forEach(clearTimeout),
  };
}

module.exports = { runDemo };
