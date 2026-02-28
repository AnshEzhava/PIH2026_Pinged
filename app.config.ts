import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Pinged',
  slug: 'DrugRepurposeRN',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: true,
  },
  android: {
    package: 'com.desoulte.DrugRepurposeRN',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
  },
  extra: {
    /**
     * Backend API base URL.
     *
     * Start the backend:
     *   .\start_backend.ps1                (Windows PowerShell)
     *   or: cd backend && uvicorn main:app
     *
     * The backend lives in ./backend/ (colocated with the app).
     * It runs on port 8000 with the optimised XGBoost pipeline:
     *   - Parallel drug scoring (8 workers)
     *   - AlphaFold skipped (NaN → XGBoost handles natively)
     *   - 22 popular diseases pre-warmed at startup
     *   - Persistent disk cache in backend/cache/
     *
     * Override by setting API_BASE_URL env var before `expo start`.
     *
     * Defaults:
     *   Android emulator → http://10.0.2.2:8000/api
     *   iOS simulator    → http://localhost:8000/api
     *   Physical device  → http://<your-LAN-IP>:8000/api
     */
    apiBaseUrl: process.env.API_BASE_URL ?? 'http://10.0.2.2:8000/api',
  },
});
