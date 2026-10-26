# 🏢 Diky Office (agent-office)

Kantor 3D yang menampilkan agent Claude Code-mu secara live. Setiap sesi Claude jadi **lead** (rubah berkacamata), dan setiap subagent jadi karakter yang masuk lewat pintu, di-briefing, kerja di mejanya, ngobrol dengan agent lain, minta izin (angkat tangan), melapor saat selesai, lalu santai di sofa.

Tanpa `npm install`. Cukup Node.js ≥ 18 dan koneksi internet (Three.js dimuat dari CDN).

## Coba dulu (demo)

```bash
node server.js --demo --open
```

Atau buka http://127.0.0.1:4777 dan klik **▶ Putar demo**.

## Pakai di project mana saja

```bash
# 1. pasang hook ke project (sekali saja per project)
node /path/ke/agent-office/install.js /path/ke/project-kamu

#    atau untuk SEMUA project sekaligus
node /path/ke/agent-office/install.js --global

# 2. nyalakan kantornya
node /path/ke/agent-office/server.js --open

# 3. jalankan claude seperti biasa (sesi baru, supaya hook terbaca)
cd /path/ke/project-kamu && claude
```

Copot hook: `node install.js /path/ke/project --uninstall` (atau `--global --uninstall`).

### Banyak profil (`CLAUDE_CONFIG_DIR`)

- Hook level project (`<project>/.claude/settings.local.json`) dibaca oleh **semua profil** yang membuka project itu, karena letaknya di folder project, bukan di folder profil.
- Hook global per profil: `--profile ~/.claude-diky` (bisa diulang), `--all-profiles` (`~/.claude` + semua `~/.claude-*`), atau `--global` (ikut `$CLAUDE_CONFIG_DIR`, default `~/.claude`).
- Tambahkan `--dry-run` untuk melihat file mana yang akan diubah.
- Panel detail menampilkan profil asal sesi (diambil dari `transcript_path`).

Installer menulis ke `.claude/settings.local.json` (file lokal yang tidak di-commit) dan membuat backup `*.agent-office.bak`. Menjalankannya berulang kali aman. Satu server bisa menampung beberapa sesi/project sekaligus.

## Cara kerjanya

```
Claude Code ──hook (async)──▶ hooks/send-event.sh ──POST /event──▶ server.js
                                                                     │ lib/office.js: event → status agent
                                                                     ▼
                                       browser ◀──SSE /stream── snapshot status
                                       public/js: Three.js scene, karakter, animasi
```

| Event hook | Yang terlihat |
|---|---|
| `UserPromptSubmit` | Lead berpikir (bubble •••) |
| `PreToolUse` Read / Grep / Edit / Bash / WebSearch… | Duduk & membaca / mencari / ngoding / terminal / browsing; layar monitor ikut berubah |
| `PreToolUse` TodoWrite | Lead menulis di whiteboard |
| `PreToolUse` Agent | Lead membagi tugas |
| `SubagentStart` | Karakter baru muncul di pintu, jalan ke lead untuk briefing, lalu ke meja |
| `PreToolUse` SendMessage | Agent jalan ke agent tujuan dan ngobrol |
| `Notification` (izin) | Berdiri dan melambai, label merah |
| `PostToolUseFailure` | Percikan merah + "Waduh, error" |
| `SubagentStop` | Melapor ke lead → confetti → santai di sofa / ngopi / lihat jendela |
| `Stop` / 45 dtk tanpa event | Nganggur |
| `SessionEnd` | Semua pulang lewat pintu |

Klik karakter (atau kartunya di kiri) untuk melihat detail: tugas, aktivitas sekarang, statistik tool, timeline.

## File

| File | Isi |
|---|---|
| `server.js` | HTTP + SSE server, tanpa dependency |
| `lib/office.js` | Reducer: payload hook → status agent (ubah `toolToActivity` untuk mapping tool baru) |
| `lib/demo.js` | Simulasi sesi multi-agent |
| `hooks/send-event.sh` | Hook yang dipanggil Claude Code |
| `install.js` | Pasang/copot hook |
| `public/js/world.js` | Kantor 3D, spot, koridor jalan |
| `public/js/character.js` | Karakter chibi & semua pose animasi |
| `public/js/pet.js` | Hewan kantor: anjing shiba dan kucing tuxedo yang suka loncat ke furnitur |
| `public/js/behavior.js` | Status → ke mana karakter pergi & apa yang dilakukan |

## Pengaturan

- `PORT=5000 node server.js` untuk port lain. Hook membaca `AGENT_OFFICE_URL` (default `http://127.0.0.1:4777`).
- Event mentah dicatat di `data/events.jsonl`, berguna untuk debugging.
- Server hanya listen di `127.0.0.1`. Isi `tool_input` dipotong sebelum dicatat, tapi path file dan perintah Bash tetap terlihat di log.
