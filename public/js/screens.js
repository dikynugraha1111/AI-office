// Canvas drawings for monitors, the whiteboard and the live activity board.
// Each monitor mode mirrors what the agent at that desk is doing right now.

const rand = (seed) => {
  let s = seed >>> 0 || 1;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)) >>> 0) / 4294967296;
};

const CODE_COLORS = ['#ff7ab2', '#78c2ff', '#a3e37a', '#ffd479', '#c39bff', '#e6e6e6'];

function lines(ctx, { x, y, w, rows, lh, seed, scroll, colors, indent = true }) {
  const r = rand(seed);
  const pre = [];
  for (let i = 0; i < 80; i++) pre.push({ ind: indent ? Math.floor(r() * 4) : 0, segs: [r(), r(), r()], c: Math.floor(r() * 99) });
  const off = Math.floor(scroll);
  const frac = scroll - off;
  for (let i = 0; i < rows + 1; i++) {
    const L = pre[(i + off) % pre.length];
    const yy = y + (i - frac) * lh;
    let xx = x + L.ind * 10;
    for (let s = 0; s < 3; s++) {
      const sw = 10 + L.segs[s] * (w * 0.28);
      if (xx + sw > x + w) break;
      ctx.fillStyle = colors[(L.c + s) % colors.length];
      ctx.fillRect(xx, yy, sw, lh * 0.45);
      xx += sw + 6;
    }
  }
}

export function drawMonitor(ctx, W, H, mode, t, seed, accent = '#ff8a3d') {
  ctx.save();
  switch (mode) {
    case 'typing':
    case 'planning': {
      ctx.fillStyle = '#1b1e2b';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#262a3b';
      ctx.fillRect(0, 0, 34, H);
      ctx.fillStyle = '#2f344a';
      ctx.fillRect(0, 0, W, 14);
      ctx.fillStyle = accent;
      ctx.fillRect(40, 3, 46, 8);
      lines(ctx, { x: 42, y: 22, w: W - 50, rows: 12, lh: 11, seed, scroll: t * 1.6, colors: CODE_COLORS });
      // blinking cursor
      if (Math.floor(t * 3) % 2) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(42 + ((t * 40) % (W - 80)), H - 26, 3, 9);
      }
      break;
    }
    case 'terminal': {
      ctx.fillStyle = '#0b0f0c';
      ctx.fillRect(0, 0, W, H);
      lines(ctx, { x: 10, y: 10, w: W - 20, rows: 13, lh: 11, seed, scroll: t * 3.2, colors: ['#4ade80', '#86efac', '#22c55e', '#bbf7d0'], indent: false });
      ctx.fillStyle = '#4ade80';
      ctx.font = 'bold 12px monospace';
      ctx.fillText('$ _', 10, H - 8);
      break;
    }
    case 'reading': {
      ctx.fillStyle = '#f6f1e7';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#e4dccb';
      ctx.fillRect(W * 0.18, 0, W * 0.64, H);
      ctx.fillStyle = '#fffdf8';
      ctx.fillRect(W * 0.2, 0, W * 0.6, H);
      lines(ctx, { x: W * 0.24, y: 10, w: W * 0.52, rows: 13, lh: 11, seed, scroll: t * 0.7, colors: ['#9b968c', '#b7b1a5', '#7c776e'], indent: false });
      ctx.fillStyle = 'rgba(255,214,90,0.45)';
      ctx.fillRect(W * 0.22, H * 0.48, W * 0.56, 10);
      break;
    }
    case 'searching': {
      ctx.fillStyle = '#151827';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#2a2f48';
      ctx.fillRect(12, 10, W - 24, 18);
      ctx.fillStyle = '#9aa3c7';
      ctx.font = '11px monospace';
      ctx.fillText('🔍 ' + '▮'.repeat(1 + (Math.floor(t * 4) % 8)), 18, 23);
      const hit = Math.floor(t * 2) % 6;
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i === hit ? accent : '#2a2f48';
        ctx.fillRect(12, 36 + i * 20, W - 24, 15);
        ctx.fillStyle = i === hit ? '#fff' : '#6d7598';
        ctx.fillRect(18, 41 + i * 20, 40 + ((i * 37) % 90), 5);
      }
      break;
    }
    case 'browsing': {
      ctx.fillStyle = '#f2f4f8';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#d9dde6';
      ctx.fillRect(0, 0, W, 16);
      ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(9 + i * 10, 8, 3.2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = '#fff';
      ctx.fillRect(44, 4, W - 56, 9);
      const sc = (t * 18) % 80;
      ctx.fillStyle = accent;
      ctx.fillRect(14, 26 - sc, W - 28, 40);
      ctx.fillStyle = '#c9ceda';
      for (let i = 0; i < 6; i++) ctx.fillRect(14 + (i % 3) * ((W - 28) / 3), 74 + Math.floor(i / 3) * 44 - sc, (W - 28) / 3 - 6, 36);
      break;
    }
    case 'supervising': {
      ctx.fillStyle = '#111522';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#8b93b5';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('TEAM STATUS', 10, 16);
      for (let i = 0; i < 5; i++) {
        const v = 0.3 + 0.6 * Math.abs(Math.sin(t * 0.8 + i * 1.7));
        ctx.fillStyle = '#23283c';
        ctx.fillRect(10, 28 + i * 24, W - 20, 14);
        ctx.fillStyle = CODE_COLORS[i];
        ctx.fillRect(10, 28 + i * 24, (W - 20) * v, 14);
      }
      break;
    }
    case 'talking': {
      ctx.fillStyle = '#eef0f7';
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 5; i++) {
        const me = i % 2;
        ctx.fillStyle = me ? accent : '#fff';
        const bw = 70 + ((seed + i * 31) % 70);
        ctx.fillRect(me ? W - bw - 12 : 12, 12 + i * 28, bw, 20);
      }
      break;
    }
    case 'thinking': {
      ctx.fillStyle = '#161a29';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 22, t * 4, t * 4 + Math.PI * 1.3);
      ctx.stroke();
      break;
    }
    case 'off': {
      ctx.fillStyle = '#0d0f15';
      ctx.fillRect(0, 0, W, H);
      break;
    }
    default: {
      // idle screensaver: a slow drifting logo
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#20253a');
      g.addColorStop(1, '#3a2a3f');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const x = W / 2 + Math.sin(t * 0.5 + seed) * (W * 0.3);
      const y = H / 2 + Math.cos(t * 0.37 + seed) * (H * 0.25);
      ctx.fillStyle = accent;
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('zzz', x, y);
    }
  }
  ctx.restore();
}

const STATE_COLORS = {
  working: '#3d8bff', thinking: '#c39bff', talking: '#2bb3a3', waiting: '#ff5c5c',
  idle: '#b8b2a7', done: '#62c454', offline: '#777',
};

export function drawWhiteboard(ctx, W, H, lead, team) {
  ctx.fillStyle = '#fbfaf7';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#2c3142';
  ctx.font = 'bold 30px "Space Grotesk", sans-serif';
  ctx.fillText('MISI HARI INI', 24, 44);
  ctx.font = '22px "Space Grotesk", sans-serif';
  ctx.fillStyle = '#4a5068';
  wrap(ctx, lead?.task || 'Menunggu tugas dari kamu…', 24, 80, W - 48, 28, 3);
  const notes = team.slice(0, 6);
  notes.forEach((a, i) => {
    const x = 24 + (i % 3) * ((W - 48) / 3);
    const y = 180 + Math.floor(i / 3) * 150;
    const w = (W - 48) / 3 - 16;
    ctx.save();
    ctx.translate(x + w / 2, y + 65);
    ctx.rotate(((i * 37) % 7 - 3) * 0.012);
    ctx.fillStyle = ['#ffe58a', '#ffc4d6', '#c6f0d0', '#c9dcff', '#ffd6a8', '#e4d4ff'][i % 6];
    ctx.shadowColor = 'rgba(0,0,0,0.15)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
    ctx.fillRect(-w / 2, -65, w, 130);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = STATE_COLORS[a.state] || '#999';
    ctx.beginPath();
    ctx.arc(-w / 2 + 16, -48, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2c3142';
    ctx.font = 'bold 20px "Space Grotesk", sans-serif';
    ctx.fillText(a.name, -w / 2 + 30, -41);
    ctx.font = '16px "Space Grotesk", sans-serif';
    ctx.fillStyle = '#4a5068';
    wrap(ctx, a.task || a.role, -w / 2 + 12, -14, w - 24, 20, 4);
    ctx.restore();
  });
}

export function drawBoard(ctx, W, H, feed, counts) {
  ctx.fillStyle = '#10131c';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f5f1e8';
  ctx.font = 'bold 34px "Space Grotesk", sans-serif';
  ctx.fillText('LIVE ACTIVITY', 26, 50);
  ctx.fillStyle = '#4ade80';
  ctx.beginPath();
  ctx.arc(W - 40, 38, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '18px monospace';
  ctx.fillStyle = '#7d859f';
  ctx.fillText(`${counts.active} aktif · ${counts.total} agent · ${counts.tools} tool call`, 26, 82);
  ctx.fillStyle = '#262b3b';
  ctx.fillRect(26, 96, W - 52, 2);
  feed.slice(0, 7).forEach((f, i) => {
    const y = 132 + i * 44;
    ctx.fillStyle = '#ff8a3d';
    ctx.font = 'bold 18px "Space Grotesk", sans-serif';
    ctx.fillText(f.agent, 26, y);
    ctx.fillStyle = '#c9cede';
    ctx.font = '17px "Space Grotesk", sans-serif';
    ctx.fillText(clip(ctx, f.text, W - 190), 150, y);
  });
}

function clip(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
  return text + '…';
}

function wrap(ctx, text, x, y, maxW, lh, maxLines) {
  const words = String(text).split(/\s+/);
  let line = '';
  let n = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      if (n === maxLines - 1) {
        ctx.fillText(clip(ctx, line + ' ' + words.slice(i).join(' '), maxW), x, y + n * lh);
        return;
      }
      ctx.fillText(line, x, y + n * lh);
      line = words[i];
      n++;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y + n * lh);
}
