// Web on a wide screen only: the app stays a centered phone-width column, and
// this panel fills the empty left side with what MICHI? is and how to try it,
// for judges who open the URL on a PC during pre-review.
import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors as c, radius, text as t } from '../theme';
import { Slant } from '../ui';

const STEPS = [
  '「まず、気になるものを1つ選ぶ」で、好きな例を押す',
  '「最初の「？」を体験する」→「デモでここまで歩く」→「発見する」',
  '発見カードを受け取り、「次の「？」へ」進む',
];

export default function DesktopIntro({ width }: { width: number }) {
  const url = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : '';
  return <ScrollView style={[s.wrap, { width }]} contentContainerStyle={s.content} accessibilityRole="complementary" accessibilityLabel="MICHI?の紹介と試し方" showsVerticalScrollIndicator={false}>
    <View style={s.panel}>
      <View>
        <Text style={[t.display32, s.logo]}>MICHI<Text style={{ color: c.red }}>?</Text></Text>
        <Text style={[t.note14B150, { color: c.mist }]}>ミチハテナ</Text>
      </View>
      <View style={{ gap: 6 }}>
        <Slant><Text style={[t.display18, { color: c.navy }]}>いつもの道に、</Text></Slant>
        <Slant style={{ marginLeft: 20 }}><Text style={[t.display18, { color: c.navy }]}>まだ知らない</Text></Slant>
        <Slant style={{ marginLeft: 6 }}><Text style={[t.display18, { color: c.navy }]}>物語がある。</Text></Slant>
      </View>
      <Text style={[t.std16N170, { color: c.white }]}>目的地へ歩く道の途中に「？」を置く、京都・三条周辺の寄り道アプリです。少し遠回りすると、石碑や道標に残る街の物語に出会えます。</Text>
      <View style={s.box}>
        <Text style={[t.std16B170, { color: c.white }]}>PCでの試し方(体験デモ)</Text>
        {STEPS.map((step, index) => <View key={step} style={s.step}>
          <Text style={[t.std16B170, { color: c.redText, width: 18 }]}>{index + 1}</Text>
          <Text style={[t.note14N150, { color: c.mist, flex: 1 }]}>{step}</Text>
        </View>)}
      </View>
      <View style={s.box}>
        <Text style={[t.std16B170, { color: c.white }]}>スマホで開くと</Text>
        <Text style={[t.note14N150, { color: c.mist }]}>石碑や案内板をカメラで撮って発見したり、現地で現在地を使って歩いたりできます。</Text>
        {url ? <Text selectable style={[t.note14B150, { color: c.link }]}>{url}</Text> : null}
      </View>
      <Text style={[t.note14N150, { color: c.muted }]}>Gemini(Vertex AI)、Google Maps Platform、Cloud Runで動いています。</Text>
    </View>
  </ScrollView>;
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 24 },
  panel: { width: '100%', maxWidth: 360, gap: 14 },
  logo: { color: c.white, transform: [{ skewX: '-8deg' }] },
  box: { gap: 6, padding: 14, borderRadius: radius.m, borderWidth: 1, borderColor: c.line, backgroundColor: c.navyCard },
  step: { flexDirection: 'row', gap: 8 },
});
