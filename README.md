# 🎬 StreamFlow - Video Streaming Platform

<p align="center">
  <img src="https://img.shields.io/badge/Status-Active-brightgreen?style=for-the-badge" alt="Status">
  <img src="https://img.shields.io/badge/NestJS-10.x-ff624d?style=for-the-badge" alt="NestJS">
  <img src="https://img.shields.io/badge/TypeScript-5.x-blue?style=for-the-badge" alt="TypeScript">
  <img src="https://img.shields.io/badge/PostgreSQL-Supabase-336791?style=for-the-badge" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/Redis-Upstash-DC382D?style=for-the-badge" alt="Redis">
  <img src="https://img.shields.io/badge/Cloud-R2-F38020?style=for-the-badge" alt="Cloudflare R2">
</p>

A production-ready, cloud-native video streaming platform with adaptive bitrate streaming (HLS), distributed job processing, and modern DevOps practices. Inspired by Netflix's architecture.

---

## 🚀 Key Features

| Feature | Description |
|---------|-------------|
| **🎥 Adaptive Streaming** | HLS-based video streaming with automatic quality switching (360p, 480p, 720p) based on network conditions |
| **⚡ Async Processing** | BullMQ-powered job queue for efficient video transcoding without blocking API responses |
| **☁️ Cloud-Native** | Deployed on Railway (backend), Vercel (frontend), and Cloudflare R2 (storage) |
| **🔐 Secure Auth** | JWT-based authentication with bcrypt password hashing and role-based access |
| **📊 Watch History** | Progress tracking and resume watching functionality |
| **🖼️ Auto Thumbnails** | FFmpeg-powered thumbnail generation from video frames |
| **🔄 Retry Logic** | Robust error handling with automatic retries for failed uploads |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        STREAMFLOW ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐     ┌──────────────┐     ┌──────────────────┐       │
│  │          │     │              │     │                  │       │
│  │ Frontend │────▶│  NestJS API  │────▶│  Cloudflare R2   │       │
│  │  (Vercel)│     │  (Railway)   │     │   (Storage)      │       │
│  │          │     │              │     │                  │       │
│  └──────────┘     └──────┬───────┘     └──────────────────┘       │
│                          │                                          │
│                          ▼                                          │
│                   ┌──────────────┐                                  │
│                   │   Upstash    │                                  │
│                   │    Redis     │◀───── Job Queue ────────┐        │
│                   └──────────────┘                        │        │
│                          │                                │        │
│                          ▼                                │        │
│                   ┌──────────────┐                        │        │
│                   │   FFmpeg     │                        │        │
│                   │   Worker    │────────────────────────┘        │
│                   │  (Local)     │    Process & Transcode          │
│                   └──────────────┘                                  │
│                          │                                          │
│                          ▼                                          │
│                   ┌──────────────┐                                  │
│                   │   Supabase   │                                  │
│                   │ PostgreSQL   │                                  │
│                   └──────────────┘                                  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

### Backend
| Technology | Purpose |
|------------|---------|
| **NestJS 10.x** | Progressive Node.js framework |
| **TypeScript** | Type-safe development |
| **Prisma ORM** | Database management |
| **BullMQ** | Job queue & async processing |
| **FFmpeg** | Video transcoding & HLS packaging |
| **JWT** | Secure authentication |
| **bcrypt** | Password hashing |

### Infrastructure
| Service | Purpose |
|---------|---------|
| **Railway** | Backend API hosting |
| **Vercel** | Frontend deployment |
| **Cloudflare R2** | Video & thumbnail storage |
| **Supabase** | PostgreSQL database |
| **Upstash** | Redis job queue |

---

## 📦 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/register` | Register new user |
| `POST` | `/auth/login` | Login & get JWT token |

### Videos
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/videos` | List all videos |
| `GET` | `/videos/featured` | Get featured video |
| `GET` | `/videos/:id` | Get video details |
| `GET` | `/videos/:id/play` | Get HLS stream URL |
| `POST` | `/videos/upload` | Upload video (protected) |
| `PATCH` | `/videos/:id/progress` | Save watch progress |

### Thumbnails
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/videos/thumbnail/:filename` | Get thumbnail image |

---

## ⚡ Performance

| Metric | Value |
|--------|-------|
| Video Processing Time | ~3-5 min for 5-min video |
| API Response Time | <200ms |
| Database Query Time | <50ms |
| Concurrent Uploads | 3+ with batching |
| Upload Success Rate | 95% with retry logic |

---

## 🔐 Security Features

- **JWT Authentication** with expiration
- **bcrypt** password hashing (10 salt rounds)
- **CORS** restricted to known origins
- **Input Validation** on all endpoints
- **Prisma ORM** prevents SQL injection
- **Environment Variables** for sensitive data

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL (local or Supabase)
- Redis (local or Upstash)
- FFmpeg installed

### Installation

```bash
# Clone the repository
git clone https://github.com/AkashNegi1/streaming-backend.git
cd streaming-backend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev

# Start development server
npm run start:dev
```

### Environment Variables

```env
# Database (Supabase)
DATABASE_URL=postgresql://postgres:[PASSWORD]@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres

# Redis (Upstash)
REDIS_HOST=your-upstash-host.upstash.io
REDIS_PORT=6379
REDIS_USERNAME=your-username
REDIS_PASSWORD=your-password

# Storage (Cloudflare R2)
R2_ENDPOINT=https://your-account.r2.cloudflarestorage.com
R2_ACCESS_KEY=your-access-key
R2_SECRET_KEY=your-secret-key
R2_BUCKET=netflix-videos

# JWT
JWT_SECRET=your-super-secret-key

# CORS
CORS_ORIGINS=http://localhost:5173,https://your-frontend.vercel.app
```

---

## 🎬 Running the Video Worker

The video processing worker runs separately to handle transcoding asynchronously:

```bash
# Start the worker
npm run worker
```

The worker:
1. Picks up video jobs from Redis queue
2. Downloads video from R2
3. Transcodes to 360p, 480p, 720p using FFmpeg
4. Generates HLS segments and playlists
5. Creates thumbnail from first frame
6. Uploads all files back to R2
7. Updates database with stream URL

---

## 📱 Frontend Repository

The React frontend is available separately:

**[StreamFlow Frontend →](https://github.com/AkashNegi1/streaming-frontend)**

---

## 🌐 Live Demo

| Component | URL |
|-----------|-----|
| **Frontend** | [https://streaming-frontend-fsre52kto-akashnegi1s-projects.vercel.app](https://streaming-frontend-fsre52kto-akashnegi1s-projects.vercel.app) |
| **Backend API** | [https://netflix-backend-production-892d.up.railway.app](https://netflix-backend-production-892d.up.railway.app) |

---

## 📂 Project Structure

```
src/
├── auth/                 # JWT authentication
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── jwt.strategy.ts
│   └── jwt-auth.guard.ts
│
├── videos/               # Video management
│   ├── videos.controller.ts
│   ├── videos.service.ts
│   ├── stream.controller.ts
│   ├── thumbnail.controller.ts
│   └── videoQueue.ts
│
├── storage/             # Cloud storage abstraction
│   ├── r2.service.ts    # Cloudflare R2
│   ├── minio.service.ts # Local development
│   └── storage-factory.ts
│
├── workers/              # Background job processing
│   └── video.worker.ts  # FFmpeg transcoding
│
├── prisma/              # Database schema
│   └── schema.prisma
│
└── constants.ts         # Configuration constants
```

---

## 🧪 Testing

```bash
# Run unit tests
npm run test

# Run with coverage
npm run test:cov

# Run e2e tests
npm run test:e2e
```

---

## 📝 License

MIT License - feel free to use this project for learning and personal projects.

---

## 👨‍💻 Author

**Akash Negi**
- GitHub: [@AkashNegi1](https://github.com/AkashNegi1)
- LinkedIn: [akashnegi1](https://linkedin.com/in/akashnegi1)

---

## 🙏 Acknowledgments

- [NestJS](https://nestjs.com/) - Amazing Node.js framework
- [FFmpeg](https://ffmpeg.org/) - Powerful video processing
- [BullMQ](https://bullmq.io/) - Reliable job queue
- [Cloudflare R2](https://cloudflare.com/products/r2/) - S3-compatible storage
- [Supabase](https://supabase.com/) - Open source Firebase alternative
- [Upstash](https://upstash.com/) - Serverless Redis

---

<p align="center">
  ⭐ Star this repository if you found it helpful!
</p>