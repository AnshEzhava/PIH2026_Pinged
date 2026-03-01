export default ({ config }) => ({
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
    eas: {
      projectId: '208eca75-f988-4402-8043-71d06927e5a7',
    },
    apiBaseUrl: process.env.API_BASE_URL ?? 'https://pih2026pinged-production.up.railway.app/api',
  },
});
