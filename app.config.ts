import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Pinged',
  slug: 'DrugRepurposeRN',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: true,
  },
  android: {
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
     * Set API_BASE_URL env var before running `expo start` to override.
     *
     * Defaults:
     *   Android emulator  → http://10.0.2.2:8000/api
     *   iOS simulator     → http://localhost:8000/api
     *   Physical device   → http://<your-LAN-IP>:8000/api
     */
    apiBaseUrl: process.env.API_BASE_URL ?? 'http://10.0.2.2:8000/api',
  },
});
