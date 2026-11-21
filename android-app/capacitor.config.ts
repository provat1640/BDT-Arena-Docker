import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bdtarena.app',
  appName: 'BDT Arena',
  webDir: '../frontend/dist',
  server: {
    url: process.env.ANDROID_BACKEND_URL || 'http://localhost:4000',
    cleartext: true
  }
};

export default config;
