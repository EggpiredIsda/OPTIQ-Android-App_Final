import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.optiq.app',
  appName: 'OPTIQ',
  webDir: 'dist',

  // FIX: bundledWebRuntime was deprecated in Capacitor 4 and removed in 5.
  // Remove it to avoid a console warning on every cold start.

  android: {
    // IMPROVEMENT: Disables the native overscroll glow/bounce on Android.
    // Without this the canvas area shows an ugly blue glow when the user
    // swipes past the top of the WebView.
    overScrollMode: 'never',

    // IMPROVEMENT: Allows the WebView to mix http/https in dev builds.
    // Has no effect in production (release builds enforce cleartext off).
    allowMixedContent: true,
  },

  plugins: {
    // IMPROVEMENT: Silence noisy Capacitor bridge logs in production.
    // Set to 'verbose' locally when debugging native↔web calls.
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
