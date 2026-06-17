# 🎮 Tank Arena - Multiplayer 3D Tank Game

A realtime, multiplayer 3D tank game built with **RivetKit** and **Three.js**, inspired by Tanki Online.

## 🚀 Getting Started

### Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server (runs both client and backend actor server concurrently):
   ```bash
   npm run dev
   ```

3. Open your browser at [http://localhost:5173](http://localhost:5173).

---

## 🛠️ Architecture

- **Backend**: Stateful RivetKit actors (`src/actors/`) running on Node.js/TypeScript.
  - `tank-matchmaker`: Realtime matchmaker with SQLite persistence.
  - `tank-match`: Game loops, movement validation, projectile physics, score keeping, and state broadcast.
- **Frontend**: 3D client using Three.js (`client/`) and HTML5 Canvas.

---

## 📦 Deployment

- **Frontend**: Deployed on **Vercel** as a static site.
- **Backend**: Deployed on **Rivet Compute** as a dockerized actor pool.
  - Automatic deployment is handled via GitHub Actions on every push to `main`.
