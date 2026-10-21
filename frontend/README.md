# Crown AI frontend (Next.js 16)

Setup, run and test instructions are in the [main README](../README.md).

```bash
cp .env.example .env.local
npm install        # also copies MediaPipe's wasm files into public/mediapipe
npm run dev        # http://localhost:3000 (the backend must be running on :8000)
npm run build      # production build
npm run test:e2e   # Playwright + axe at phone, tablet and laptop sizes
```

The browser never sees the OpenAI key: every `/api/*` request is rewritten to FastAPI by `next.config.ts`.
