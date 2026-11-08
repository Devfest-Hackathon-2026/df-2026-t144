// "発見中…" screen body, laid out like a camera app: a tall viewfinder, one
// big shutter, and a round camera toggle beside it.
// - Camera off: the shutter means "発見する" (GPS radius or demo position).
// - Camera on: the shutter takes a photo, shrinks it, and sends it once to the
//   server, where Gemini transcribes the text and code matches the spot's
//   marker words. Photos are never stored.
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import Art from './Art';
import { apiConfigured, ApiError, fetchRecognition } from '../apiClient';
import { colors as c, radius, text as t } from '../theme';
import { Icon, QPin } from '../ui';
import type { Spot } from '../types';

const nativeDriver = Platform.OS !== 'web';
const FINDER_HEIGHT = 360;

/** A 0→1 loop for decorative motion. Stays at 0 when the user asked for reduced motion. */
export function useLoop(duration: number) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then((reduce) => {
      if (!alive || reduce) return;
      loop = Animated.loop(Animated.timing(value, { toValue: 1, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: nativeDriver }));
      loop.start();
    });
    return () => { alive = false; loop?.stop(); };
  }, [value, duration]);
  return value;
}

type Props = {
  spot: Spot;
  eligible: boolean;
  camera: { allowed: boolean; reason: string };
  saving: boolean;
  loaded: boolean;
  onDiscover: () => void;
  onMatched: () => void;
  /** Rendered over the bottom edge of the viewfinder (the distance / "何か見つかった" banner). */
  banner?: React.ReactNode;
  /** Rendered between the viewfinder and the shutter (hint, demo move). */
  children?: React.ReactNode;
};
type Message = { tone: 'info' | 'miss' | 'error'; text: string };

async function shrinkToBase64(uri: string, width: number) {
  const context = ImageManipulator.manipulate(uri);
  if (width > 1280) context.resize({ width: 1280 });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
  return (saved.base64 ?? '').replace(/^data:[^,]+,/, '');
}

export default function CameraScan({ spot, eligible, camera, saving, loaded, onDiscover, onMatched, banner, children }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const ref = useRef<CameraView>(null);
  const scan = useLoop(2400);
  const pulse = useLoop(1100);
  const scale = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, eligible ? 1.14 : 1.05, 1] });
  const scanY = scan.interpolate({ inputRange: [0, 1], outputRange: [36, FINDER_HEIGHT - 36] });

  useEffect(() => { setOn(false); setMessage(null); }, [spot.id]);

  async function toggleCamera() {
    if (on) { setOn(false); setMessage(null); return; }
    setMessage(null);
    let granted = permission?.granted ?? false;
    if (!granted) granted = (await requestPermission()).granted;
    if (!granted) { setMessage({ tone: 'error', text: 'カメラが許可されていません。端末やブラウザの設定でカメラを許可すると使えます。' }); return; }
    setOn(true);
  }

  async function shoot() {
    if (!ref.current || busy) return;
    setBusy(true);
    setMessage({ tone: 'info', text: 'Geminiが写真の文字を読んでいます…' });
    try {
      const photo = await ref.current.takePictureAsync({ quality: 0.7, shutterSound: false });
      if (!photo?.uri) throw new Error('写真を撮れませんでした。もう一度お試しください。');
      const image = await shrinkToBase64(photo.uri, photo.width);
      const result = await fetchRecognition(spot.id, image);
      if (result.matched) { setMessage(null); setOn(false); onMatched(); return; }
      setMessage({ tone: 'miss', text: result.readText
        ? `読めた文字：「${result.readText}」\nこの「？」の手がかりは見つかりませんでした。石碑や案内板の文字が大きく写るように撮り直してください。`
        : `${result.scene ? `写っていたもの：${result.scene}。` : ''}文字を読み取れませんでした。石碑や案内板に近づいて撮ってください。` });
    } catch (error) {
      const text = error instanceof ApiError && error.code === 'NOT_CONNECTED' ? '写真の読み取りには、サーバーへの接続が必要です。' : error instanceof Error ? error.message : '写真を送れませんでした。';
      setMessage({ tone: 'error', text });
    } finally {
      setBusy(false);
    }
  }

  const shutterDisabled = on ? busy || !camera.allowed || !apiConfigured : !eligible || !loaded || saving;
  const shutterLabel = on ? '撮って調べる' : '発見する';
  const helper = on
    ? (!apiConfigured ? '写真の読み取りには、サーバーへの接続が必要です。' : camera.allowed ? '石碑や案内板の文字が大きく写るように撮ってください。' : camera.reason)
    : (eligible ? '押すと物語が開き、発見カードがもらえます。' : '「？」の近くまで行くと押せます。カメラで石碑を撮って発見することもできます。');

  return <View style={{ gap: 14 }}>
    <View>
      <View style={s.finder}>
        {on ? <CameraView ref={ref} style={StyleSheet.absoluteFill} facing="back" animateShutter={false}
          onMountError={() => { setOn(false); setMessage({ tone: 'error', text: 'カメラを起動できませんでした。ほかのアプリがカメラを使っていないか確かめてください。' }); }} />
          : <>
            <View style={[StyleSheet.absoluteFill, { opacity: .35 }]}><Art category={spot.category} height={FINDER_HEIGHT} /></View>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(11, 22, 49, 0.45)' }]} />
          </>}
        {[s.cornerTL, s.cornerTR, s.cornerBL, s.cornerBR].map((corner, index) => <View key={index} pointerEvents="none" style={[s.corner, corner]} />)}
        {(!eligible || on) && <Animated.View pointerEvents="none" style={[s.scanLine, { transform: [{ translateY: scanY }] }]} />}
        <Animated.View pointerEvents="none" style={[{ zIndex: 2, transform: [{ scale }] }, on && s.pinOnCamera]}><QPin size={on ? 48 : eligible ? 88 : 68} /></Animated.View>
        {on && <View style={s.live} pointerEvents="none"><View style={s.liveDot} /><Text style={[t.note14B150, { color: c.white }]}>カメラ</Text></View>}
      </View>
      {banner}
    </View>
    {children}
    <View style={s.controls}>
      <View style={s.side}>
        <Pressable accessibilityRole="button" accessibilityLabel={on ? 'カメラを止める' : 'カメラで「？」を探す'} onPress={() => void toggleCamera()} style={({ pressed }) => [s.round, on && s.roundOn, pressed && { opacity: .8 }]}>
          <Icon name={on ? 'close' : 'camera'} size={22} />
        </Pressable>
        <Text style={[t.note14N150, { color: c.mist }]}>{on ? '止める' : 'カメラ'}</Text>
      </View>
      <View style={s.center}>
        <Pressable accessibilityRole="button" accessibilityLabel={shutterLabel} accessibilityState={{ disabled: shutterDisabled, busy: busy || saving }} disabled={shutterDisabled} onPress={() => (on ? void shoot() : onDiscover())}
          style={({ pressed }) => [s.shutter, shutterDisabled && s.shutterOff, pressed && { transform: [{ scale: .94 }] }]}>
          {busy || saving ? <ActivityIndicator color={on ? c.white : c.red} /> : <View style={[s.shutterInner, on && s.shutterInnerCamera, shutterDisabled && { backgroundColor: c.line }]} />}
        </Pressable>
        <Text style={[t.std16B170, { color: shutterDisabled ? c.muted : c.white }]}>{busy ? '読み取り中' : shutterLabel}</Text>
      </View>
      <View style={s.side} />
    </View>
    <Text style={[t.note14N150, { color: c.muted, textAlign: 'center' }]}>{helper}</Text>
    {message && <View style={[s.message, message.tone === 'error' && s.error, message.tone === 'info' && s.info]} accessibilityLiveRegion="polite">
      <Text style={[t.std16N170, { color: c.white }]}>{message.text}</Text>
    </View>}
    <Text style={[t.note14N150, { color: c.muted }]}>{camera.reason}写真はGeminiで文字を読むためだけに送り、保存しません。</Text>
  </View>;
}

const s = StyleSheet.create({
  finder: { height: FINDER_HEIGHT, borderRadius: radius.m, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: c.navyCard },
  corner: { position: 'absolute', width: 40, height: 40, borderColor: c.white, zIndex: 1 },
  cornerTL: { top: 32, left: 40, borderTopWidth: 4, borderLeftWidth: 4 },
  cornerTR: { top: 32, right: 40, borderTopWidth: 4, borderRightWidth: 4 },
  cornerBL: { bottom: 56, left: 40, borderBottomWidth: 4, borderLeftWidth: 4 },
  cornerBR: { bottom: 56, right: 40, borderBottomWidth: 4, borderRightWidth: 4 },
  scanLine: { position: 'absolute', top: 0, left: 40, right: 40, height: 2, backgroundColor: c.redText, opacity: 0.85, zIndex: 1 },
  pinOnCamera: { position: 'absolute', top: 40 },
  live: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 8, borderRadius: radius.full, zIndex: 3 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.redText },
  controls: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  side: { width: 72, alignItems: 'center', gap: 4, paddingTop: 14 },
  center: { alignItems: 'center', gap: 6 },
  round: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: c.mist, alignItems: 'center', justifyContent: 'center', backgroundColor: c.navyCard },
  roundOn: { backgroundColor: c.navyRaised, borderColor: c.white },
  shutter: { width: 84, height: 84, borderRadius: 42, borderWidth: 5, borderColor: c.white, alignItems: 'center', justifyContent: 'center' },
  shutterOff: { borderColor: c.line },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: c.red },
  shutterInnerCamera: { backgroundColor: c.white },
  message: { borderLeftWidth: 4, borderLeftColor: c.red, backgroundColor: c.navyRaised, padding: 12 },
  info: { borderLeftColor: c.link },
  error: { backgroundColor: c.redDark, borderLeftColor: c.white },
});
