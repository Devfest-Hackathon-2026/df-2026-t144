import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import type { LocationFix } from './types';

export function useLocation(enabled: boolean) {
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsSettings, setNeedsSettings] = useState(false);
  const subscription = useRef<Location.LocationSubscription | null>(null);
  const firstFixTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const stop = useCallback(() => {
    generation.current += 1;
    subscription.current?.remove();
    subscription.current = null;
    if (firstFixTimer.current) clearTimeout(firstFixTimer.current);
    firstFixTimer.current = null;
  }, []);
  const start = useCallback(async (askPermission = true) => {
    stop();
    const current = generation.current;
    const active = () => current === generation.current && mounted.current;
    const clearWait = () => {
      if (firstFixTimer.current) clearTimeout(firstFixTimer.current);
      firstFixTimer.current = null;
      setLoading(false);
    };
    setFix(null);
    setLoading(true);
    setError(null);
    setNeedsSettings(false);
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (!active()) return;
      if (permission.status !== 'granted' && permission.canAskAgain && askPermission) {
        permission = await Location.requestForegroundPermissionsAsync();
        if (!active()) return;
      }
      if (permission.status !== 'granted') {
        setNeedsSettings(permission.status === 'denied' || !permission.canAskAgain);
        setError('現在地が許可されていません。位置情報を許可すると、現地の発見ができます。デモなら許可せずに試せます。');
        clearWait();
        return;
      }
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!active()) return;
      if (!servicesEnabled) {
        setError('端末の位置情報サービスがオフです。端末の設定でオンにしてから「再取得」を押してください。');
        clearWait();
        return;
      }
      firstFixTimer.current = setTimeout(() => {
        if (!active()) return;
        setError('現在地の取得に時間がかかっています。空の見える場所で再取得するか、デモで体験できます。');
        clearWait();
      }, 20000);
      const watcher = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 5000 }, location => {
        if (!active()) return;
        setFix({ latitude: location.coords.latitude, longitude: location.coords.longitude, accuracy: location.coords.accuracy, timestamp: location.timestamp });
        setError(null);
        clearWait();
      }, () => { if (active()) { setFix(null); setError('GPSを取得できません。位置情報の設定を確認して再試行してください。'); clearWait(); } });
      if (!active()) watcher.remove();
      else subscription.current = watcher;
    } catch {
      if (active()) { setFix(null); setError('現在地を取得できませんでした。位置情報の設定を確認してください。'); clearWait(); }
    }
  }, [stop]);
  useEffect(() => {
    mounted.current = true;
    if (enabled) void start();
    else { stop(); setFix(null); setError(null); setLoading(false); setNeedsSettings(false); }
    const app = AppState.addEventListener('change', state => {
      if (!enabled) return;
      if (state === 'active') void start(false);
      else { stop(); setFix(null); setLoading(false); }
    });
    return () => { mounted.current = false; stop(); app.remove(); };
  }, [enabled, start, stop]);
  return { fix, error, loading, needsSettings, retry: start };
}
