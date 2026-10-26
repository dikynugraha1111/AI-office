# Cara Pakai Diky Office di Project Lain

Folder Agent Office: `~/Documents/try-ego/agent-office`

## Langkah cepat

### 1. Pasang hook ke project (sekali saja per project)

```bash
node ~/Documents/try-ego/agent-office/install.js /path/ke/project-kamu
```

- Hook ditulis ke `/path/ke/project-kamu/.claude/settings.local.json`. File lama dibackup ke `settings.local.json.agent-office.bak`.
- Berlaku untuk **semua profil** (`claude`, `claudediky`, `claudedikyraya`, `claudesabik`, `claudeparamartha`), karena file ini ada di folder project, bukan di folder profil.
- Aman dijalankan berulang kali.

### 2. Nyalakan kantornya (terminal terpisah, biarkan jalan)

```bash
node ~/Documents/try-ego/agent-office/server.js --open
```

- Browser terbuka di http://127.0.0.1:4777
- Kalau muncul `Port 4777 sudah dipakai`, berarti server sudah jalan. Cukup buka link di atas.

### 3. Jalankan Claude di project itu (harus sesi baru)

```bash
cd /path/ke/project-kamu
claudediky        # atau claude / claudedikyraya / claudesabik / claudeparamartha
```

- Hook hanya dibaca saat sesi dimulai. Sesi yang sudah terbuka sebelum install tidak akan muncul.
- Lead (rubah berkacamata) muncul begitu sesi mulai.
- Supaya muncul banyak karakter, minta pekerjaan yang memakai subagent, misalnya:
  _"pakai 3 subagent paralel untuk riset X, Y, dan Z"_.

---

## Opsi lain

### Pasang untuk semua project sekaligus (per profil)

```bash
# lihat dulu file mana yang akan diubah
node ~/Documents/try-ego/agent-office/install.js --all-profiles --dry-run

# semua profil: ~/.claude, ~/.claude-diky, ~/.claude-diky-raya, ~/.claude-paramartha, ~/.claude-sabik
node ~/Documents/try-ego/agent-office/install.js --all-profiles

# atau satu profil saja (boleh diulang)
node ~/Documents/try-ego/agent-office/install.js --profile ~/.claude-diky
```

Kalau dipasang global **dan** per project sekaligus, event akan terkirim dua kali. Pilih salah satu.

### Lihat demo tanpa menjalankan agent

```bash
node ~/Documents/try-ego/agent-office/server.js --demo --open
```

Atau klik **▶ Putar demo** di halaman.

### Port lain

```bash
PORT=5000 node ~/Documents/try-ego/agent-office/server.js --open
export AGENT_OFFICE_URL=http://127.0.0.1:5000   # set sebelum menjalankan claude, supaya hook kirim ke port ini
```

---

## Mematikan server

- **Terminalnya masih terbuka:** tekan `Ctrl + C` di terminal itu.
- **Terminal sudah ditutup / server jalan di background:**
  ```bash
  kill $(lsof -ti tcp:4777)   # hentikan proses yang memakai port 4777
  lsof -i tcp:4777            # cek: tidak ada output = sudah mati
  ```

Claude tetap aman walau server mati. Hook gagal kirim secara diam-diam, jadi sesi tidak melambat atau error.

---

## Mencopot

```bash
# dari satu project
node ~/Documents/try-ego/agent-office/install.js /path/ke/project-kamu --uninstall

# dari semua profil
node ~/Documents/try-ego/agent-office/install.js --all-profiles --uninstall
```

Hanya entri milik Agent Office yang dihapus. Hook lain di settings tetap utuh.

---

## Kalau tidak ada yang muncul

1. **Server jalan?** Buka http://127.0.0.1:4777. Status di kiri atas harus **Live** (hijau).
2. **Hook terkirim?** Cek log event mentah:
   ```bash
   tail -f ~/Documents/try-ego/agent-office/data/events.jsonl
   ```
   Kalau log kosong saat Claude bekerja, hook belum terbaca.
3. **Hook terdaftar?** Ketik `/hooks` di dalam Claude, lalu cari `send-event.sh`.
4. **Sesi baru?** Keluar dari Claude, lalu jalankan lagi di folder project yang benar.
5. **Folder dipindah?** Hook menyimpan path absolut ke `hooks/send-event.sh`. Kalau folder `agent-office` dipindah, jalankan ulang langkah 1 di setiap project.

---

## Catatan

- Butuh Node.js ≥ 18 dan internet (Three.js dan font dimuat dari CDN). Tidak perlu `npm install`.
- Server hanya bisa diakses dari komputer ini (`127.0.0.1`).
- `data/events.jsonl` berisi path file dan perintah Bash dari sesi Claude. Jangan dibagikan sembarangan, dan boleh dihapus kapan saja.
- Klik karakter atau kartunya untuk melihat detail: tugas, aktivitas, statistik tool, timeline, dan profil asal sesi.
- Penjelasan arsitektur dan daftar file ada di `README.md`.
