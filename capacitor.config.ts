import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aireels.maker',
  appName: 'AI Reels Maker',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
