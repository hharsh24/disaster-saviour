# Locked-in Architecture for Hackathon

## Principles
1. **Single Server**: FastAPI acts as the backend API and serves the static HTML/CSS/JS frontend. This eliminates CORS issues and simplifies deployment.
2. **Zero Setup DB**: SQLite is a local file-based database, avoiding reliance on external Postgres/Cloud databases.
3. **Offline Auth**: Session-cookie login via FastAPI and passlib. No Firebase/Clerk needed.
4. **Vanilla Frontend**: No build step (no React/Webpack). Files are just served statically.
5. **Live Polling**: `setInterval` in JS to fetch `/zones` updates. No websockets needed.
