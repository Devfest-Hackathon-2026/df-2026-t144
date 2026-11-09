import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { apiConfigured, fetchInterests } from '../apiClient';
import { matchTopicsByKeywords, toggleTopic } from '../interests';
import { colors as c, radius, text as t } from '../theme';
import { Icon, Slant } from '../ui';
import type { Topic } from '../types';

type Props = { topics: Topic[]; selected: string[]; onChange: (topicIds: string[]) => void };

/** Free text goes to Gemini (via the server) and comes back as fixed topic tags; tags can also be picked directly. */
export default function InterestPicker({ topics, selected, onChange }: Props) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ body: string; byGemini: boolean } | null>(null);
  const ready = Boolean(text.trim()) && !loading;

  async function ask() {
    const value = text.trim();
    if (!value || loading) return;
    setLoading(true);
    setMessage(null);
    let topicIds: string[] = [];
    let reply: string | null = null;
    let byGemini = false;
    try {
      if (!apiConfigured) throw new Error('offline');
      const result = await fetchInterests(value);
      topicIds = result.topicIds;
      reply = result.reply;
      byGemini = result.source === 'gemini';
    } catch {
      topicIds = matchTopicsByKeywords(value, topics);
    } finally {
      setLoading(false);
    }
    if (topicIds.length === 0) {
      setMessage({ body: '当てはまる視点が見つかりませんでした。下のタグから選んでください。', byGemini: false });
      return;
    }
    onChange(topicIds);
    const labels = topics.filter((topic) => topicIds.includes(topic.id)).map((topic) => `#${topic.label}`).join(' ');
    setMessage({ body: `${reply ? `${reply}\n` : ''}${labels} の「？」を先に並べました。`, byGemini });
  }

  return <View style={s.wrap}>
    <Slant color={c.red}><Text style={[t.display18, { color: c.white }]} accessibilityRole="header">何が気になる？</Text></Slant>
    <Text nativeID="interest-label" style={[t.std16N170, { color: c.mist }]}>好きなものを書くと、関係する「？」を先に出します。</Text>
    <View style={s.inputRow}>
      <TextInput value={text} onChangeText={setText} onSubmitEditing={() => void ask()} placeholder="例：水路、幕末、橋の飾り" placeholderTextColor={c.muted}
        maxLength={80} returnKeyType="search" accessibilityLabel="気になること（自由入力）" style={[t.std16N170, s.input]} />
      <Pressable accessibilityRole="button" accessibilityLabel="入力した内容で探す" onPress={() => void ask()} disabled={!ready}
        style={({ pressed }) => [s.ask, !ready && s.disabled, pressed && s.pressed]}>
        <View style={s.unskew}>{loading ? <ActivityIndicator color={c.white} /> : <Text style={[t.oln16B100, { color: ready ? c.white : c.muted }]}>探す</Text>}</View>
      </Pressable>
    </View>
    {message && <View style={s.message} accessibilityLiveRegion="polite">
      <Text style={[t.std16N170, { color: c.white }]}>{message.body}</Text>
      {message.byGemini && <Text style={[t.note14N150, { color: c.mist }]}>Geminiが言葉を視点に分けました。並び順は、視点が一致した数で決めています。</Text>}
    </View>}
    <View style={s.chips}>{topics.map((topic) => {
      const active = selected.includes(topic.id);
      return <Pressable key={topic.id} accessibilityRole="checkbox" accessibilityState={{ checked: active }} aria-checked={active} accessibilityLabel={topic.label}
        onPress={() => { setMessage(null); onChange(toggleTopic(selected, topic.id)); }} style={[s.chip, active && s.chipActive]}>
        {active && <Icon name="check" color={c.white} size={16} />}
        <Text style={[active ? t.note14B150 : t.note14N150, { color: active ? c.white : c.mist }]}>#{topic.label}</Text>
      </Pressable>;
    })}</View>
  </View>;
}

const s = StyleSheet.create({
  wrap: { gap: 10, backgroundColor: c.navyCard, borderWidth: 1, borderColor: c.line, borderRadius: radius.m, padding: 16 },
  inputRow: { flexDirection: 'row', gap: 10 },
  input: { flex: 1, minHeight: 48, borderRadius: radius.s, borderWidth: 1, borderColor: c.line, backgroundColor: c.navy, paddingHorizontal: 12, color: c.white },
  ask: { minWidth: 76, minHeight: 48, backgroundColor: c.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, transform: [{ skewX: '-10deg' }] },
  unskew: { transform: [{ skewX: '10deg' }] },
  disabled: { backgroundColor: c.navyRaised, borderWidth: 1, borderColor: c.line }, pressed: { backgroundColor: c.redDark },
  message: { borderLeftWidth: 4, borderLeftColor: c.red, backgroundColor: c.navyRaised, padding: 12, gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.full, borderWidth: 1, borderColor: c.line, backgroundColor: c.navy, paddingHorizontal: 12, minHeight: 40 },
  chipActive: { backgroundColor: c.red, borderColor: c.red },
});
