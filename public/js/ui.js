// DOM overlay: team roster, agent detail panel, live feed, buttons.
import { ACT_LABEL } from './character.js';

const EMOJI = { cat: '🐱', bear: '🐻', bunny: '🐰', frog: '🐸', robot: '🤖', panda: '🐼', fox: '🦊' };
const STATE_LABEL = {
  working: 'Bekerja', thinking: 'Berpikir', talking: 'Ngobrol', waiting: 'Menunggu kamu',
  idle: 'Nganggur', done: 'Selesai', offline: 'Pulang',
};
const TYPE_ICON = { tool: '🛠', prompt: '💬', spawn: '✨', done: '✅', error: '⚠️', notify: '✋', session: '🚪', compact: '🗜' };

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function ago(t, now = Date.now()) {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 5) return 'baru saja';
  if (s < 60) return `${s} dtk lalu`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} mnt lalu`;
  return `${Math.round(m / 60)} jam lalu`;
}

export function mountUI({ onSelect, onDemo, onReset, onRecenter }) {
  let snapshot = { agents: [], feed: [] };
  let selected = null;

  $('#btn-demo').onclick = onDemo;
  $('#btn-reset').onclick = onReset;
  $('#btn-center').onclick = onRecenter;
  $('#empty-demo').onclick = onDemo;
  $('#panel-close').onclick = () => onSelect(null);
  addEventListener('keydown', (e) => e.key === 'Escape' && onSelect(null));

  function renderRoster() {
    const list = $('#roster-list');
    const agents = [...snapshot.agents].sort((a, b) => (a.kind === 'lead' ? -1 : 0) - (b.kind === 'lead' ? -1 : 0) || a.startedAt - b.startedAt);
    list.innerHTML = agents
      .map(
        (a) => `
      <button class="card ${a.id === selected ? 'active' : ''}" data-id="${esc(a.id)}" data-state="${a.state}">
        <span class="avatar" style="--c:${a.color}">${EMOJI[a.species] || '🙂'}</span>
        <span class="meta">
          <b>${esc(a.name)} <small>${esc(a.kind === 'lead' ? 'Lead' : a.role)}</small></b>
          <span class="line"><i class="dot"></i>${esc(ACT_LABEL[a.activity] || a.activity)}${a.detail ? ' · ' + esc(a.detail) : ''}</span>
        </span>
      </button>`,
      )
      .join('');
    list.querySelectorAll('.card').forEach((el) => (el.onclick = () => onSelect(el.dataset.id)));
    $('#roster-count').textContent = agents.length;
    $('#empty').classList.toggle('show', agents.length === 0);
  }

  function renderPanel() {
    const panel = $('#panel');
    const a = snapshot.agents.find((x) => x.id === selected);
    panel.classList.toggle('open', !!a);
    if (!a) return;
    const now = Date.now();
    const team = snapshot.agents.filter((x) => x.parentId === a.id);
    const lead = snapshot.agents.find((x) => x.id === a.parentId);
    const tools = Object.entries(a.stats.tools).sort((x, y) => y[1] - x[1]).slice(0, 6);
    const max = tools[0]?.[1] || 1;

    $('#panel-body').innerHTML = `
      <header class="p-head">
        <span class="avatar big" style="--c:${a.color}">${EMOJI[a.species] || '🙂'}</span>
        <div>
          <div class="eyebrow">${esc(a.kind === 'lead' ? 'Team Lead' : a.role)}${a.project ? ' · ' + esc(a.project) : ''}${a.profile ? ' · profil ' + esc(a.profile) : ''}</div>
          <h2>${esc(a.name)}</h2>
          <div class="state-pill" data-state="${a.state}"><i class="dot"></i>${esc(STATE_LABEL[a.state] || a.state)} · ${esc(ACT_LABEL[a.activity] || a.activity)}</div>
        </div>
      </header>

      <section>
        <h3>Sedang</h3>
        <p class="now">${esc(a.detail || '—')}</p>
        ${a.bubble ? `<p class="quote">“${esc(a.bubble.text)}”</p>` : ''}
      </section>

      <section>
        <h3>Tugas</h3>
        <p>${esc(a.task || 'Belum ada tugas')}</p>
        ${lead ? `<p class="muted">Dilapor ke <a href="#" data-go="${esc(lead.id)}">${esc(lead.name)}</a></p>` : ''}
      </section>

      <section class="stats">
        <div><span>Tool calls</span><b>${a.stats.toolCalls}</b></div>
        <div><span>Error</span><b>${a.stats.errors}</b></div>
        <div><span>Bergabung</span><b>${ago(a.startedAt, now)}</b></div>
        <div><span>${a.kind === 'lead' ? 'Anggota tim' : 'Status sejak'}</span><b>${a.kind === 'lead' ? team.length : ago(a.stateSince, now)}</b></div>
      </section>

      ${team.length ? `<section><h3>Tim</h3><div class="team">${team.map((t) => `<a href="#" data-go="${esc(t.id)}" class="chip" data-state="${t.state}"><span>${EMOJI[t.species]}</span>${esc(t.name)}</a>`).join('')}</div></section>` : ''}

      ${tools.length ? `<section><h3>Tool paling sering</h3><div class="bars">${tools
        .map(([n, c]) => `<div class="bar"><span>${esc(n.replace(/^mcp__/, ''))}</span><i style="--w:${(c / max) * 100}%"></i><b>${c}</b></div>`)
        .join('')}</div></section>` : ''}

      <section>
        <h3>Timeline</h3>
        <ol class="timeline">
          ${a.history.map((h) => `<li data-type="${h.type}"><span class="ic">${TYPE_ICON[h.type] || '•'}</span><span class="tx">${esc(h.text)}</span><time>${ago(h.t, now)}</time></li>`).join('') || '<li class="muted">Belum ada aktivitas</li>'}
        </ol>
      </section>`;
    panel.querySelectorAll('[data-go]').forEach((el) => (el.onclick = (e) => {
      e.preventDefault();
      onSelect(el.dataset.go);
    }));
  }

  function renderFeed() {
    $('#feed').innerHTML = snapshot.feed
      .slice(0, 8)
      .map((f) => `<span class="item" data-type="${f.type}"><b>${esc(f.agent)}</b> ${esc(f.text)}</span>`)
      .join('<span class="sep">·</span>');
  }

  // relative times tick even when no events arrive
  setInterval(() => selected && renderPanel(), 5000);

  return {
    update(s) {
      snapshot = s;
      renderRoster();
      renderPanel();
      renderFeed();
    },
    select(id) {
      selected = id;
      renderRoster();
      renderPanel();
    },
    setConnection(ok) {
      $('#conn').dataset.ok = ok;
      $('#conn .label').textContent = ok ? 'Live' : 'Terputus…';
    },
  };
}
