import type { ExpoConfig } from 'expo/config';

const iosGoogleMapsApiKey = process.env.GOOGLE_MAPS_IOS_API_KEY;
const androidGoogleMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
const config: ExpoConfig = {
  name: 'MICHI?',
  slug: 'michi',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'michi',
  userInterfaceStyle: 'light',
  ios: { supportsTablet: false, bundleIdentifier: 'jp.overcoding.michi' },
  android: { package: 'jp.overcoding.michi' },
  web: { bundler: 'metro', name: 'MICHI? — いつもの道の、その先へ。' },
  plugins: [
    ['expo-location', {
      locationWhenInUsePermission: '近くの「？」を見つけるため、利用中だけ現在地を使います。',
      isIosBackgroundLocationEnabled: false,
      isAndroidBackgroundLocationEnabled: false,
    }],
    ...(iosGoogleMapsApiKey || androidGoogleMapsApiKey ? [
      ['react-native-maps', { iosGoogleMapsApiKey, androidGoogleMapsApiKey }] as [string, Record<string, string | undefined>],
    ] : []),
  ],
  extra: { iosGoogleMapsEnabled: Boolean(iosGoogleMapsApiKey) },
};
export default config;
