# LOOPHOLES.md

Analisis celah pada spesifikasi CIF Customer Information Checking (Soal bagian 2-6).
Empat celah di bawah dipilih karena dampaknya paling besar untuk keamanan: pengajuan yang
lolos dengan CIF milik orang lain, akses dokumen nasabah lain, enumerasi data nasabah lewat
endpoint publik, dan pengosongan penyimpanan berkas.

| # | Celah | Lokasi | Dampak | Prioritas |
|---|-------|--------|--------|-----------|
| 1 | Confidence bisa menembus 90 dengan NIK salah 1 digit dan nama mirip, sehingga PASS jatuh ke CIF orang lain | `internal/services/matching.go` - `nikScore`, `nameScore`, `Confidence` | Pengajuan dan fasilitas kredit atas nama nasabah lain | Kritis |
| 2 | Akses dokumen memakai application_id sebagai kunci rahasia (IDOR) | `internal/handlers/uploads.go` - `RequireApplicationHeader`, `Get`, `Create` | KTP/NPWP/slip gaji orang lain bisa dibaca dan disisipi | Kritis |
| 3 | Tanpa rate limit, submit ulang tanpa batas, verdict + `matched_no_cif` dikembalikan tiap request | `cmd/api/main.go`, `internal/handlers/cif.go` - `Check` | Enumerasi NIK-kepada-CIF dan pengosongan kuota API harian | Tinggi |
| 4 | Batas ukuran hanya per file, tidak per pengajuan; ukuran chunk dipercaya dari klien | `internal/handlers/uploads.go` - `Create`; spesifikasi 6.1 dan 6.3 | Disk penuh, layanan berhenti (DoS) | Tinggi |

---

## 1. PASS dengan CIF orang lain lewat toleransi NIK dan cap nama

**Lokasi**
- `internal/services/matching.go` - `nikScore`: jarak Levenshtein 1 digit = 0.9, bobot NIK 35.
- `internal/services/matching.go` - `nameScore`: Jaro-Winkler >= 0.92 dianggap 1.0.
- `internal/services/matching.go` - `Confidence`: bobot 35/25/15/15/10, total 100.
- Spesifikasi bagian 4.1 dan catatan "kritis" pada 5.2 no.3 sudah menyatakan cap 0.938 menjadi 1.0.

**Flow terjadinya**
1. Attacker memakai NIK target yang salah 1 digit (salah ketik, atau sengaja digeser). `nikScore` = 0.9, bukan 0.
2. Nama dibuat mirip target sehingga Jaro-Winkler >= 0.92 lalu dibulatkan jadi 1.0. Di fixture ada tiga pasang nama yang sudah melewati ambang: `andi permata` vs `andi pratama` (JW 0.9303), `budi santosa` vs `budi susanto` (0.9212), `fajar nugraha` vs `fajar nugroho` (0.9385).
3. Tanggal lahir, nomor HP, dan nama pasangan diisi persis seperti data target. Ketiganya memberi 15 + 15 + 10.
4. Confidence = (35 x 0.9 + 25 x 1 + 15 x 1 + 15 x 1 + 10 x 1) / 100 x 100 = 96.5.
5. Aturan bagian 5: 96.5 >= 90 dan score >= 80, jadi PASS dengan `matched_no_cif` milik orang lain.

**Dampak bisnis**
- Fasilitas kredit disetujui memakai CIF dan riwayat kredit nasabah lain.
- Riwayat kredit korban tercemar; penagihan dan laporan SLIK salah sasaran.
- Dua digit NIK yang berbeda adalah dua orang berbeda menurut Dukcapil; sistem tidak membedakannya.

**Saran penanganan**
- PASS hanya boleh bila jarak NIK = 0. Jarak 1 (skor 0.9) maksimal REFER, bukan PASS.
- Naikkan ambang cap nama ke 0.97, atau pakai aturan margin: PASS hanya bila confidence kandidat teratas unggul minimal 5 poin dari kandidat kedua.
- Validasi struktur NIK (6 digit wilayah + 6 digit tanggal + 4 digit urut) supaya salah ketik tanggal atau wilayah terdeteksi sebelum skor dihitung.
- Verifikasi tambahan sebelum PASS: OTP ke nomor HP kandidat atau pencocokan foto KTP.

**Test yang disarankan**
- NIK beda 1 digit + nama JW 0.93 + dob/HP/pasangan sama harus berakhir REFER, bukan PASS.
- Dua kandidat dengan confidence selisih < 5 poin harus menghasilkan REFER.

---

## 2. IDOR (Insecure Direct Object Reference ) dokumen: application_id dipakai sebagai kunci rahasia

**Lokasi**
- `internal/handlers/uploads.go` - `RequireApplicationHeader`: hanya memeriksa header tidak kosong dan application_id ada di database.
- `internal/handlers/uploads.go` - `Get`: membandingkan header dengan application_id pemilik, lalu menyajikan file.
- `internal/handlers/uploads.go` - `Create`: tidak memeriksa status keputusan pengajuan.

**Flow terjadinya**
1. Attacker memperoleh application_id yang valid. Nilainya berurutan `APP-YYYYMMDD-NNNN` (lihat `NextApplicationID` di `internal/repository/repository.go`), jadi tinggal diiterasi per tanggal.
2. `GET /api/uploads/{upload_id}` dengan header `X-Application-Id: APP-20261029-0004` menyajikan dokumen pemilik ID tersebut. Header ini bukan rahasia; nilainya sama dengan ID yang mudah ditebak.
3. `POST /api/uploads` dengan header yang sama menempelkan dokumen palsu ke pengajuan orang lain, karena handler hanya memeriksa application_id ada, bukan siapa pemiliknya.
4. Upload juga diterima untuk pengajuan berstatus NOT PASS. Spesifikasi 6.2 meminta 409, kode tidak memeriksa status keputusan; header yang tidak cocok dibalas 404, bukan 403.

**Dampak bisnis**
- Dokumen identitas (KTP, NPWP, slip gaji, buku nikah) milik nasabah lain dapat diunduh.
- Attacker dapat menempelkan dokumen palsu sehingga analis kredit membaca bukti yang salah.
- Ketidaksesuaian dengan spesifikasi (409 dan 403) membuat integration test penguji gagal.

**Saran penanganan**
- Terbitkan token akses acak per pengajuan untuk upload dan unduh; jangan pakai application_id sebagai kredensial.
- Ikat akses ke sesi pemilik pengajuan, bukan ke header yang bisa dipalsukan.
- Tolak upload dengan 409 bila keputusan NOT PASS, dan balas 403 saat header tidak cocok dengan pemilik.
- Simpan dokumen di storage privat dan sajikan lewat URL bertanda tangan berumur pendek.

**Test yang disarankan**
- Upload ke pengajuan NOT PASS harus 409.
- GET dokumen dengan header pemilik lain harus 403; tanpa header harus 401.

---

## 3. Endpoint verdict tanpa rate limit dan tanpa batas submit ulang

**Lokasi**
- `cmd/api/main.go`: router hanya memakai `gin.Recovery()` dan logger, tidak ada middleware rate limit maupun autentikasi.
- `internal/handlers/cif.go` - `Check`: respons 201 selalu memuat `identity_confidence`, `credit_score`, `matched_no_cif`, dan objek `customer` lengkap, termasuk saat keputusan NOT PASS.
- Spesifikasi 5.1: submit ulang diperbolehkan, tiap submit menjadi pengajuan baru.

**Flow terjadinya**
1. Attacker mengirim `POST /api/cif/check` berulang, tiap kali mengubah satu field (nama atau nomor HP) di sekitar NIK target.
2. Setiap respons memberi verdict, `identity_confidence`, dan `matched_no_cif` walau keputusan NOT PASS. Contoh nyata: test case 5.2 no.7, confidence 64.46 tetap mengembalikan CIF 8100000001.
3. Attacker menyusun tabel NIK - CIF - nama - confidence untuk 100 record hanya dengan mengulang langkah 1; tidak perlu sekali pun mendapat PASS.
4. Volume request yang sama menghabiskan kuota harian Beeceptor, sehingga pengguna sah menerima 503.

**Dampak bisnis**
- Enumerasi data nasabah: pemetaan NIK ke CIF beserta nama dan confidence.
- Layanan berhenti untuk pengguna sah ketika kuota upstream habis (DoS tidak sengaja maupun sengaja).
- Biaya kuota dan beban DB naik tanpa jejak, karena tidak ada audit log akses.

**Saran penanganan**
- Rate limit per IP dan per NIK (misalnya 5 per menit, 20 per hari), balas 429.
- Jangan kembalikan `matched_no_cif`, `credit_score`, dan objek `customer` saat keputusan NOT PASS.
- Tambahkan idempotency key dan deteksi submit berulang untuk NIK yang sama.
- CAPTCHA atau verifikasi sesi setelah beberapa percobaan gagal, plus alerting pada lonjakan volume.

**Test yang disarankan**
- Request ke-6 dalam satu menit dari satu IP harus 429.
- Respons NOT PASS tidak boleh memuat `matched_no_cif`.

---

## 4. Batas ukuran hanya per file, tidak per pengajuan; ukuran chunk dipercaya dari klien

**Lokasi**
- `internal/handlers/uploads.go` - `Create`: `http.MaxBytesReader` dan `io.LimitReader` membatasi 20 MB per file, tanpa batas total per pengajuan.
- Spesifikasi 6.1: maksimal 5 file per pengajuan (5 x 20 MB = 100 MB), tanpa batas per nasabah atau per IP.
- Spesifikasi 6.3: `total_size` dan `total_chunks` dikirim klien dan tidak wajib diverifikasi.

**Flow terjadinya**
1. Attacker membuat pengajuan berkali-kali (tiap submit menghasilkan application_id baru, tanpa auth), lalu mengunggah 5 file 20 MB pada masing-masing pengajuan.
2. File ditulis ke disk sebelum baris dokumen dibuat; bila penyimpanan DB gagal, hanya file terakhir yang dihapus (`os.Remove`), tidak ada pembersih berkala untuk file yatim.
3. Jika endpoint chunk diimplementasikan: `POST /api/uploads/init` menerima `total_chunks` dan `total_size` dari klien. Deklarasikan 1 chunk, lalu kirim 100 MB; `complete` tidak membandingkan byte yang diterima dengan `total_size`.

**Dampak bisnis**
- Disk penuh sehingga seluruh layanan berhenti - DoS untuk semua nasabah.
- Biaya penyimpanan naik; file yatim sulit dilacak karena tidak ada referensi di database.
- Kuota unggah per pengajuan pada spesifikasi tidak menahan penyalahgunaan karena pengajuan tak terbatas.

**Saran penanganan**
- Batas total per pengajuan (misalnya 25 MB) dan kuota harian per IP/nasabah.
- Verifikasi byte yang diterima terhadap `total_size` saat `complete`, dan tolak chunk di luar rentang `total_chunks`.
- Jalankan pembersihan berkala untuk file tanpa baris dokumen dan batasi jumlah file per pengajuan di server, bukan hanya di frontend.
- Monitoring kapasitas disk dengan alert sebelum penuh.

**Test yang disarankan**
- Upload ke-6 pada pengajuan yang sama harus 400 atau 413.
- `complete` dengan total byte tidak sama dengan `total_size` harus 400.

---

## Di luar empat prioritas di atas

Celah lain yang sudah ditemukan dan layak masuk backlog: tidak ada autentikasi pada `GET /api/cif` dan
`GET /api/cif/{application_id}` sehingga seluruh data pengajuan dapat ditarik tanpa kredensial;
validasi file hanya ekstensi tanpa magic bytes dan file disajikan inline tanpa `nosniff`;
field `flags` (2 BLACKLIST, 2 DECEASED, 2 DUPLICATE_CIF) tidak pernah dipakai untuk keputusan;
score null atau error dipaksa menjadi 0 sehingga gangguan upstream berubah menjadi penolakan kredit;
cache satu key global dengan TTL 5 menit; NIK dan nama ditulis ke log setiap kandidat;
normalisasi nama menghapus gelar di posisi mana pun; tie-break kandidat tidak didefinisikan.
