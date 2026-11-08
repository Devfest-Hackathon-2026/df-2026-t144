import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import type { MapProps } from './Map.types';
import { colors as c, radius, text as t } from '../theme';

export default function DiscoveryMap(props: MapProps) {
  const map = useRef<MapView>(null);
  const google = Platform.OS === 'android' || (Constants.executionEnvironment !== 'storeClient' && Boolean(Constants.expoConfig?.extra?.iosGoogleMapsEnabled));
  useEffect(() => {
    if (props.route?.coordinates.length) {
      map.current?.fitToCoordinates(props.route.coordinates, {
        edgePadding: { top: 65, left: 45, right: 45, bottom: 65 }, animated: true,
      });
    }
  }, [props.route?.coordinates, props.destination.id]);
  if (props.route?.source === 'google' && !google) {
    return <View style={styles.fallback}><Text style={[t.std18B160, { color: c.text }]}>Google Maps の徒歩ルート</Text><Text style={[t.std16N170, { color: c.body }]}>所要時間は下のルート一覧で確認できます。地図に実際の経路を重ねるには、Google Mapsを設定したアプリが必要です。</Text><Text style={[t.note14N150, { color: c.sub }]}>Google Maps</Text></View>;
  }
  return <View style={styles.frame}>
    <MapView ref={map} style={StyleSheet.absoluteFill} provider={google ? PROVIDER_GOOGLE : undefined}
      initialRegion={{ latitude: 35.0098, longitude: 135.771, latitudeDelta: 0.008, longitudeDelta: 0.007 }}
      showsCompass={false} showsMyLocationButton={false} showsPointsOfInterests={false} toolbarEnabled={false}
      onMapReady={() => props.route?.coordinates.length && map.current?.fitToCoordinates(props.route.coordinates, { edgePadding: { top: 60, left: 45, right: 45, bottom: 60 }, animated: false })}>
      {props.route && <Polyline coordinates={props.route.coordinates} strokeColor={c.key} strokeWidth={5} lineDashPattern={props.route.source === 'demo' ? [6, 5] : undefined} />}
      {props.spots.map(spot => {
        const done = props.discoveredIds.includes(spot.id);
        return <Marker key={spot.id} coordinate={spot.coordinate} onPress={() => props.onSelect(spot.id)} tracksViewChanges accessibilityLabel={`${done ? spot.name : '未発見の「？」'}を開く`}>
          <View style={[styles.marker, done && styles.done, props.selectedId === spot.id && styles.selected]}><Text style={[styles.markerText, done && { color: c.key }]}>{done ? '✓' : '？'}</Text></View>
        </Marker>;
      })}
      <Marker coordinate={props.destination.coordinate} title={props.destination.name} pinColor={c.text} />
      {props.position && <Marker coordinate={props.position} anchor={{ x: .5, y: .5 }}><View style={styles.position}><View style={styles.dot} /></View></Marker>}
    </MapView>
    <View pointerEvents="none" style={styles.legend}><Text style={[t.note14N150, { color: c.text }]}>{props.route?.source === 'demo' ? '点線はデモの概略経路です' : props.route?.source === 'google' ? 'Google Maps・徒歩ルート' : '周辺の「？」'}</Text></View>
  </View>;
}
const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: c.ground },
  marker: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: c.white, backgroundColor: c.key, alignItems: 'center', justifyContent: 'center' },
  done: { backgroundColor: c.white, borderColor: c.key }, selected: { borderColor: c.black, borderWidth: 3 }, markerText: { fontSize: 20, fontWeight: '700', color: c.white },
  position: { width: 28, height: 28, backgroundColor: '#0031D833', borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: c.user, borderWidth: 3, borderColor: c.white },
  legend: { position: 'absolute', top: 8, left: 8, backgroundColor: c.white, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.s, borderWidth: 1, borderColor: c.divider },
  fallback: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: c.surfaceAlt, gap: 8 },
});
