# Android wrapper

Build the web app, install wrapper dependencies, add Android, and sync:

```bash
npm run build --prefix ../frontend
npm install
npx cap add android
ANDROID_BACKEND_URL=https://your-public-backend.example npm run sync
npm run build
```

The debug APK will be under `android/app/build/outputs/apk/debug/app-debug.apk`. Copy a signed release APK to `frontend/public/downloads/bdt-arena.apk` only after replacing the placeholder and completing store/legal review.

Do not hardcode a GitHub Codespaces URL into source. Set `ANDROID_BACKEND_URL` at build/sync time or in the shell environment.
