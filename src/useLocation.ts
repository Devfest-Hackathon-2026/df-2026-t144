import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import type { LocationFix } from './types';

export function useLocation(enabled: boolean) {
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const subscription = useRef<Location.LocationSubscription | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const stop = useCallback(() => {
    generation.current += 1;
    subscription.current?.remove();
    subscription.current = null;
  }, []);
  const start = useCallback(async () => {
    stop();
    const current = generation.current;
    setLoading(true);
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (current !== generation.current) return;
      if (permission.status !== 'granted') {
        setError('現在地の許可がありません。端末の設定で許可するか、体験デモをご利用ください。');
        return;
      }
      const watcher = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 5000 }, location => {
        if (current !== generation.current || !mounted.current) return;
        setFix({ latitude: location.coords.latitude, longitude: location.coords.longitude, accuracy: location.coords.accuracy, timestamp: location.timestamp });
        setLoading(false);
      }, () => { if (current === generation.current && mounted.current) { setError('GPSを取得できません。位置情報の設定を確認して再試行してください。'); setLoading(false); } });
      if (current !== generation.current) watcher.remove();
      else subscription.current = watcher;
    } catch {
      if (current === generation.current && mounted.current) setError('現在地を取得できませんでした。位置情報の設定を確認してください。');
    } finally {
      if (current === generation.current && mounted.current) setLoading(false);
    }
  }, [stop]);
  useEffect(() => {
    mounted.current = true;
    if (enabled) void start();
    else { stop(); setFix(null); setError(null); setLoading(false); }
    const app = AppState.addEventListener('change', state => {
      if (!enabled) return;
      if (state === 'active') void start(); else stop();
    });
    return () => { mounted.current = false; stop(); app.remove(); };
  }, [enabled, start, stop]);
  return { fix, error, loading, retry: start };
}
