# CIF APPS

Aplikasi dengan arsitektur **React (Frontend)** dan **Go (Backend)** yang dijalankan menggunakan Docker Compose.

## Tech Stack

- Frontend: React + Vite
- Backend: Go + Gin
- Web Server: Nginx
- Containerization: Docker & Docker Compose

## Project Structure

```text
cif_challenge/
├── backend/
│   ├── cmd/
│   ├── go.mod
│   └── Dockerfile
├── frontend/
│   ├── src/
│   ├── package.json
│   ├── nginx.conf
│   └── Dockerfile
└── docker-compose.yml
```

## Getting Started

### Prerequisites

- Docker
- Docker Compose

### Run Application

Build and start containers:

```bash
docker compose up -d --build
```

### Access Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:3000/api

### Check Containers

```bash
docker compose ps
```

### View Logs

```bash
docker compose logs -f
```

### Stop Application

```bash
docker compose down
```

## Architecture

- React handles the user interface.
- Go handles backend logic and API services.
- Nginx serves the frontend and proxies API requests.
- Docker Compose manages frontend and backend containers.

## License

MIT
