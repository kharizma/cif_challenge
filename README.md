# CIF APPS

Aplikasi CIF dengan **React (frontend)**, **Go/Gin (backend)**, **PostgreSQL**, dan **Redis**, dijalankan dengan Docker Compose.

## Tech Stack

- Frontend: React + Vite, disajikan Nginx
- Backend: Go + Gin + GORM
- Database: PostgreSQL 17
- Cache: Redis 7 (cache Customer Information API, TTL 300 detik)
- API eksternal: Beeceptor (`customer-information`, `scoring`)
- Containerization: Docker & Docker Compose

## Project Structure

```text
cif_challenge/
├── backend/
│   ├── cmd/
│   │   ├── api/          # HTTP server
│   │   └── migrate/      # golang-migrate runner
│   ├── internal/
│   ├── migrations/       # file .sql untuk migrate
│   ├── uploads/          # file upload (di-mount ke container)
│   └── Dockerfile        # build api + migrate
├── frontend/
│   ├── src/
│   ├── nginx.conf        # serve static + proxy /api ke backend
│   └── Dockerfile
└── docker-compose.yml
```

## Services

| Service | Image / build | Port host | Fungsi |
|---|---|---|---|
| `db` | postgres:17-alpine | - | database `cif` |
| `redis` | redis:7-alpine | - | cache CIF |
| `migrate` | build `./backend` | - | jalankan migrasi lalu exit |
| `backend` | build `./backend` | 8080 | REST API |
| `frontend` | build `./frontend` | 3000 | UI + proxy `/api` |

Data persisten: volume `pgdata`, volume `redisdata`, dan folder host `./backend/uploads`.

## Getting Started

### Prerequisites

- Docker Engine 20.10+
- Docker Compose v2 (`docker compose`, bukan `docker-compose`)
- Koneksi internet keluar (backend memanggil Beeceptor)

### Run Application

```bash
docker compose up -d --build
```

Urutan start otomatis: `db` sehat, `redis` sehat, `migrate` selesai, lalu `backend`, lalu `frontend`.
Tidak perlu menjalankan migrasi manual pada run pertama: service `migrate` sudah menjalankannya.

Cek status:

```bash
docker compose ps
docker compose logs -f backend
```

Buka:

- Frontend: http://localhost:3000
- Backend API langsung: http://localhost:8080
- Health check: http://localhost:8080/health

## Database Migration

Migrasi memakai `cmd/migrate` (golang-migrate) dan file di `backend/migrations/`.

Jalankan migrasi:

```bash
docker compose run --rm migrate
```

`migrate` di atas menjalankan `up` (default command di compose). Perintah lain:

```bash
# naikkan semua migrasi (eksplisit)
docker compose run --rm migrate /app/migrate -dir /app/migrations up

# turun 1 langkah
docker compose run --rm migrate /app/migrate -dir /app/migrations down 1

# cek versi
docker compose run --rm migrate /app/migrate -dir /app/migrations version

# paksa versi (setelah migrasi gagal / dirty)
docker compose run --rm migrate /app/migrate -dir /app/migrations force 1
```

Catatan:

- `docker compose run --rm migrate` otomatis menyalakan `db` dan menunggu sehat.
- Migrasi juga jalan otomatis setiap `docker compose up`, karena `backend` menunggu `migrate` selesai sukses.
- Hasil tanpa perubahan ditulis `no change`, bukan error.
- Container `migrate` membaca setting DB dari environment compose, bukan dari `backend/.env`.

Query cepat ke database:

```bash
docker compose exec db psql -U cif -d cif -c "\dt"
docker compose exec db psql -U cif -d cif -c "select count(*) from customer;"
```

## Configuration

Nilai default ada di `docker-compose.yml` dan cukup untuk demo. Untuk mengubah, edit blok `environment` service terkait.

| Variable | Default | Dipakai |
|---|---|---|
| `DB_HOST` / `DB_PORT` | `db` / `5432` | backend, migrate |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | `cif` / `test` / `cif` | backend, migrate, db |
| `REDIS_HOST` / `REDIS_PORT` | `redis` / `6379` | backend |
| `CACHE_TTL_SECONDS` | `300` | backend (minimum 300) |
| `UPLOAD_DIR` | `/app/uploads` | backend |
| `CUSTOMER_INFO_URL` | `https://candidate.free.beeceptor.com/api/customer-information` | backend |
| `SCORING_URL` | `https://candidate.free.beeceptor.com/api/scoring` | backend |

Beeceptor punya kuota harian. Backend menyimpan hasil `customer-information` di Redis dengan TTL minimal 5 menit, jadi request berulang tidak memakan kuota. Jika Redis mati, backend memakai cache in-memory (ada warning di log).

## File Upload

- Disimpan ke folder host `backend/uploads`, di-mount ke `/app/uploads` di container. File tetap ada setelah container dihapus.
- Batas ukuran 20MB; Nginx sudah dinaikkan ke 25MB. Format: JPG, JPEG, PNG, PDF.
- Upload memerlukan header `X-Application-Id` milik pengajuan yang sudah ada, dan service `backend` harus bisa menulis ke folder tersebut.

## Test

Test ada di `backend/` dan dijalankan dengan Go (bukan lewat container, image runtime hanya berisi binary).

### Semua test (unit + integration)

```bash
cd backend
go test ./...
```

Tanpa `DB_*` yang menunjuk Postgres hidup, `TestUploadFlowIntegration` otomatis di-skip dan suite tetap lulus. Lihat bagian berikut untuk menjalankannya sungguhan.

### Test integrasi upload

Butuh Postgres yang reachable dan user dengan hak `CREATE DATABASE`. Test membuat database sementara `cif_test_<timestamp>`, menjalankan semua migrasi, lalu menghapusnya sendiri.

Opsi A — pakai Postgres dari compose (paling mudah, `db` sudah di-publish ke host port 5433):

```bash
docker compose up -d db
cd backend
DB_DRIVER=postgres DB_HOST=127.0.0.1 DB_PORT=5433 \
DB_USER=cif DB_PASSWORD=test DB_NAME=postgres DB_SSLMODE=disable \
  go test ./internal/handlers/ -run TestUploadFlowIntegration -v -count=1
```

Opsi B — pakai Postgres lokal sendiri:

```bash
cd backend
DB_HOST=127.0.0.1 DB_PORT=5432 DB_USER=cif DB_PASSWORD=test DB_NAME=postgres DB_SSLMODE=disable \
  go test ./internal/handlers/ -run TestUploadFlowIntegration -v -count=1
```

`DB_NAME=postgres` hanya dipakai untuk koneksi awal; nama database test dibuat otomatis.

Hasil yang diharapkan:

```text
=== RUN   TestUploadFlowIntegration
--- PASS: TestUploadFlowIntegration (6.47s)
PASS
ok  	cif-backend/internal/handlers	6.946s
```

### Test unit saja

```bash
cd backend

# hanya package tertentu
go test ./internal/services/ -v

# tanpa cache, ulang dari awal
go test ./... -count=1

# hanya paket yang berubah + dependannya
go test ./internal/handlers/ ./internal/services/
```

### Melihat test yang di-skip

```bash
cd backend
go test ./internal/handlers/ -run TestUploadFlowIntegration -v
# output saat Postgres tidak ada:
# --- SKIP: TestUploadFlowIntegration (0.04s)
#     integration test needs Postgres: ...
```

### Yang diuji `TestUploadFlowIntegration`

- POST `/api/uploads` multipart + header `X-Application-Id` → 201, `upload_id` dan `size` benar
- file tersimpan di disk sebagai `<upload_id>.<ext>` dengan byte identik
- row `documents` tersimpan dan terhubung ke pengajuan
- GET `/api/uploads/:id` mengembalikan byte dan `Content-Type` yang sama
- GET tanpa header → 401, GET dengan aplikasi lain → 404
- file dengan ekstensi tidak didukung → 400 tanpa menyisakan file/row

## Useful Commands

```bash
# stop, data tetap
docker compose down

# stop dan hapus volume database + redis (data hilang)
docker compose down -v

# rebuild setelah kode berubah
docker compose up -d --build

# log satu service
docker compose logs -f frontend
```

## Troubleshooting

- **`backend` restart terus, log `database unreachable`**: pastikan `db` healthy (`docker compose ps`), lalu lihat `docker compose logs migrate`.
- **Upload 413**: naikkan `client_max_body_size` di `frontend/nginx.conf` bila batas dinaikkan.
- **Data CIF tidak muncul, log menyebut Beeceptor**: cek koneksi internet dan sisa kuota Beeceptor.
- **Port 3000/8080 dipakai proses lain**: ubah pemetaan port di `docker-compose.yml`.
- **`docker compose` tidak dikenal**: pakai Docker Compose v2 (`docker compose version`), bukan `docker-compose`.

## Architecture

- React (Vite build) disajikan Nginx pada port 3000.
- Nginx mem-proxy `/api/*` ke `backend:8080`.
- Go/Gin menangani logika CIF, menyimpan data ke PostgreSQL, dan menyimpan cache di Redis.
- Docker Compose mengatur jaringan antar-container; backend hanya reachable dari frontend atau port 8080 host.

## License

MIT
