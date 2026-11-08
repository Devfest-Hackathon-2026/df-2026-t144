import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { apiConfigured, fetchInterests } from '../apiClient';
import { matchTopicsByKeywords, toggleTopic } from '../interests';
import { colors as c, radius, text as t } from '../theme';
import { Icon } from '../ui';
import type { Topic } from '../types';

type Props = { topics: Topic[]; selected: string[]; onChange: (topicIds: string[]) => void };

/** Free text goes to Gemini (via the server) and comes back as fixed topic tags; tags can also be picked directly. */
export default function InterestPicker({ topics, selected, onChange }: Props) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ body: string; byGemini: boolean } | null>(null);

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
      setMessage({ body: '当てはまる分類が見つかりませんでした。下の一覧から選んでください。', byGemini: false });
      return;
    }
    onChange(topicIds);
    const labels = topics.filter((topic) => topicIds.includes(topic.id)).map((topic) => `「${topic.label}」`).join('');
    setMessage({ body: `${reply ? `${reply}\n` : ''}${labels}に当てはまる「？」を上に並べました。`, byGemini });
  }

  return <View style={s.wrap}>
    <Text style={[t.std20B150, { color: c.text }]} accessibilityRole="header">興味のあること</Text>
    <Text style={[t.std16N170, { color: c.body }]}>入力するか一覧から選ぶと、関係する「？」を上に並べます。</Text>
    <View style={s.field}>
      <Text nativeID="interest-label" style={[t.std16B170, { color: c.text }]}>気になること（自由入力）</Text>
      <View style={s.inputRow}>
        <TextInput value={text} onChangeText={setText} onSubmitEditing={() => void ask()} placeholder="例：水路、幕末の話" placeholderTextColor={c.sub}
          maxLength={80} returnKeyType="search" accessibilityLabel="気になること（自由入力）" style={[t.std16N170, s.input]} />
        <Pressable accessibilityRole="button" accessibilityLabel="入力した内容で並べ替える" onPress={() => void ask()} disabled={!text.trim() || loading}
          style={({ pressed }) => [s.ask, (!text.trim() || loading) && s.disabled, pressed && s.pressed]}>
          {loading ? <ActivityIndicator color={c.white} /> : <Text style={[t.oln16B100, { color: text.trim() ? c.white : c.sub }]}>反映</Text>}
        </Pressable>
      </View>
    </View>
    {message && <View style={s.message} accessibilityLiveRegion="polite">
      <Text style={[t.std16N170, { color: c.body }]}>{message.body}</Text>
      {message.byGemini && <Text style={[t.note14N150, { color: c.sub }]}>Geminiが入力を分類しました。並び順は、分類が一致した数で決めています。</Text>}
    </View>}
    <View style={s.chips}>{topics.map((topic) => {
      const active = selected.includes(topic.id);
      return <Pressable key={topic.id} accessibilityRole="checkbox" accessibilityState={{ checked: active }} accessibilityLabel={topic.label}
        onPress={() => { setMessage(null); onChange(toggleTopic(selected, topic.id)); }} style={[s.chip, active && s.chipActive]}>
        {active && <Icon name="check" color={c.key} size={16} />}
        <Text style={[active ? t.note14B150 : t.note14N150, { color: active ? c.key : c.body }]}>{topic.label}</Text>
      </Pressable>;
    })}</View>
    <Text style={[t.note14N150, { color: c.sub }]}>3つまで選べます。</Text>
  </View>;
}

const s = StyleSheet.create({
  wrap: { gap: 8, marginTop: 8 },
  field: { gap: 4, marginTop: 4 },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, minHeight: 48, borderRadius: radius.m, borderWidth: 1, borderColor: c.border, backgroundColor: c.white, paddingHorizontal: 12, color: c.text },
  ask: { minWidth: 72, minHeight: 48, borderRadius: radius.m, backgroundColor: c.key, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  disabled: { backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.divider }, pressed: { backgroundColor: c.keyDark },
  message: { backgroundColor: c.keyBg, borderRadius: radius.m, padding: 12, gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.full, borderWidth: 1, borderColor: c.border, backgroundColor: c.white, paddingHorizontal: 12, minHeight: 40 },
  chipActive: { borderWidth: 2, borderColor: c.key, backgroundColor: c.keyBg },
});
