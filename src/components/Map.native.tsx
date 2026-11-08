import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import type { MapProps } from './Map.types';
import { colors } from '../theme';

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
    return <View style={styles.fallback}><Text style={styles.title}>Google Maps の徒歩ルート</Text><Text style={styles.note}>経路の時間は下のカードで確認できます。地図上の実経路表示には、Google Maps を設定したアプリを使用します。</Text><Text style={styles.note}>Google Maps</Text></View>;
  }
  return <View style={styles.frame}>
    <MapView ref={map} style={StyleSheet.absoluteFill} provider={google ? PROVIDER_GOOGLE : undefined}
      initialRegion={{ latitude: 35.0098, longitude: 135.771, latitudeDelta: 0.008, longitudeDelta: 0.007 }}
      showsCompass={false} showsMyLocationButton={false} showsPointsOfInterests={false} toolbarEnabled={false}
      onMapReady={() => props.route?.coordinates.length && map.current?.fitToCoordinates(props.route.coordinates, { edgePadding: { top: 60, left: 45, right: 45, bottom: 60 }, animated: false })}>
      {props.route && <Polyline coordinates={props.route.coordinates} strokeColor={colors.ink} strokeWidth={5} lineDashPattern={props.route.source === 'demo' ? [6, 5] : undefined} />}
      {props.spots.map(spot => <Marker key={spot.id} coordinate={spot.coordinate} onPress={() => props.onSelect(spot.id)} tracksViewChanges accessibilityLabel={`${props.discoveredIds.includes(spot.id) ? spot.name : spot.hint}を開く`}>
        <View style={[styles.marker, props.discoveredIds.includes(spot.id) && styles.done, props.selectedId === spot.id && styles.selected]}><Text style={styles.markerText}>{props.discoveredIds.includes(spot.id) ? '✓' : '?'}</Text></View>
      </Marker>)}
      <Marker coordinate={props.destination.coordinate} title={props.destination.name} pinColor={colors.ink} />
      {props.position && <Marker coordinate={props.position} anchor={{ x: .5, y: .5 }}><View style={styles.position}><View style={styles.dot} /></View></Marker>}
    </MapView>
    <View pointerEvents="none" style={styles.legend}><Text style={styles.legendText}>{props.route?.source === 'demo' ? '点線はデモの概略経路です' : props.route?.source === 'google' ? 'Google Maps · 徒歩ルート' : '周辺の発見スポット'}</Text></View>
  </View>;
}
const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.light },
  marker: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: colors.white, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  done: { backgroundColor: '#D5E3D1' }, selected: { borderColor: colors.ink, borderWidth: 3 }, markerText: { fontSize: 22, fontWeight: '800', color: colors.ink },
  position: { width: 26, height: 26, backgroundColor: '#476DD333', borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#527BD0', borderWidth: 3, borderColor: 'white' },
  legend: { position: 'absolute', top: 14, left: 14, backgroundColor: '#FFFFFFEE', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12 }, legendText: { fontSize: 10, color: colors.ink },
  fallback: { flex: 1, justifyContent: 'center', padding: 26, backgroundColor: colors.light, gap: 12 }, title: { fontSize: 20, fontWeight: '700', color: colors.ink }, note: { fontSize: 13, lineHeight: 23, color: colors.muted },
});
