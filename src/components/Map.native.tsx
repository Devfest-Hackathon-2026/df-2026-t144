import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import type { MapProps } from './Map.types';
import { colors as c, radius, text as t } from '../theme';
import { PIN_BOX } from '../pins';
import { Pagoda, QPin } from '../ui';

// Night style for Google Maps on Android / iOS development builds.
const DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: c.mapGround }] },
  { elementType: 'labels.text.fill', stylers: [{ color: c.muted }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: c.navy }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: c.mapRoad }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: c.mapWater }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

export default function DiscoveryMap(props: MapProps) {
  const map = useRef<MapView>(null);
  const google = Platform.OS === 'android' || (Constants.executionEnvironment !== 'storeClient' && Boolean(Constants.expoConfig?.extra?.iosGoogleMapsEnabled));
  useEffect(() => {
    if (props.route?.coordinates.length) {
      map.current?.fitToCoordinates(props.route.coordinates, {
        edgePadding: { top: 140, left: 45, right: 45, bottom: 80 }, animated: true,
      });
    }
  }, [props.route?.coordinates, props.destination.id]);
  if (props.route?.source === 'google' && !google) {
    return <View style={styles.fallback}><Text style={[t.std18B160, { color: c.white }]}>Google Maps の徒歩ルート</Text><Text style={[t.std16N170, { color: c.mist }]}>所要時間は上のルート比較で確認できます。地図に実際の経路を重ねるには、Google Mapsを設定したアプリが必要です。</Text><Text style={[t.note14N150, { color: c.muted }]}>Google Maps</Text></View>;
  }
  return <View style={styles.frame}>
    <MapView ref={map} style={StyleSheet.absoluteFill} provider={google ? PROVIDER_GOOGLE : undefined}
      customMapStyle={google ? DARK_STYLE : undefined} userInterfaceStyle="dark"
      initialRegion={{ latitude: 35.0098, longitude: 135.771, latitudeDelta: 0.008, longitudeDelta: 0.007 }}
      showsCompass={false} showsMyLocationButton={false} showsPointsOfInterests={false} toolbarEnabled={false}
      onMapReady={() => props.route?.coordinates.length && map.current?.fitToCoordinates(props.route.coordinates, { edgePadding: { top: 140, left: 45, right: 45, bottom: 80 }, animated: false })}>
      {props.route && <>
        <Polyline coordinates={props.route.coordinates} strokeColor={c.red} strokeWidth={7} />
        <Polyline coordinates={props.route.coordinates} strokeColor={c.white} strokeWidth={2.5} lineDashPattern={[4, 8]} />
      </>}
      {props.spots.map(spot => {
        const done = props.discoveredIds.includes(spot.id);
        const picked = props.selectedId === spot.id;
        return <Marker key={spot.id} coordinate={spot.coordinate} anchor={{ x: .5, y: PIN_BOX.tipY / PIN_BOX.height }} zIndex={picked ? 10 : 1} onPress={() => props.onSelect(spot.id)} tracksViewChanges accessibilityLabel={`${done ? spot.name : '未発見の「？」'}を開く`}>
          <QPin done={done} category={spot.category} selected={picked} size={picked ? 46 : 40} />
        </Marker>;
      })}
      <Marker coordinate={props.destination.coordinate} anchor={{ x: .5, y: 1 }} accessibilityLabel={`目的地 ${props.destination.name}`} tracksViewChanges={false}>
        <Pagoda size={34} />
      </Marker>
      {props.position && <Marker coordinate={props.position} anchor={{ x: .5, y: .5 }}><View style={styles.position}><View style={styles.dot} /></View></Marker>}
    </MapView>
  </View>;
}
const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: c.mapGround },
  position: { width: 30, height: 30, backgroundColor: `${c.user}44`, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 16, height: 16, borderRadius: 8, backgroundColor: c.user, borderWidth: 3, borderColor: c.white },
  fallback: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: c.navyCard, gap: 8, borderRadius: radius.m },
});
