import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { apiConfigured, fetchInterests } from '../apiClient';
import { matchTopicsByKeywords, toggleTopic } from '../interests';
import { colors as c } from '../theme';
import type { Topic } from '../types';

type Props = { topics: Topic[]; selected: string[]; onChange: (topicIds: string[]) => void };

/** "今日は、何が気になる？" — free text goes to Gemini (via the server) and comes back as fixed topic tags. */
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
      setMessage({ body: '近い視点が見つかりませんでした。下のタグから選べます。', byGemini: false });
      return;
    }
    onChange(topicIds);
    const labels = topics.filter((topic) => topicIds.includes(topic.id)).map((topic) => `「${topic.label}」`).join('');
    setMessage({ body: reply ? `${reply} ${labels}の「？」を先に並べました。` : `${labels}の「？」を先に並べました。`, byGemini });
  }

  return <View style={s.card}>
    <Text style={s.eyebrow}>WHAT CATCHES YOUR EYE?</Text>
    <Text style={s.title}>今日は、何が気になる？</Text>
    <View style={s.inputRow}>
      <TextInput value={text} onChangeText={setText} onSubmitEditing={() => void ask()} placeholder="例：水路が好き、幕末の話" placeholderTextColor="#9AA494"
        maxLength={80} returnKeyType="search" accessibilityLabel="気になることを入力" style={s.input} />
      <Pressable accessibilityRole="button" accessibilityLabel="気になることで探す" onPress={() => void ask()} disabled={!text.trim() || loading}
        style={({ pressed }) => [s.ask, (!text.trim() || loading) && s.disabled, pressed && s.pressed]}>
        {loading ? <ActivityIndicator color={c.lime} /> : <Text style={s.askText}>探す</Text>}
      </Pressable>
    </View>
    {message && <View style={s.message}>
      <Text style={s.messageText}>{message.body}</Text>
      {message.byGemini && <Text style={s.byline}>Geminiがあなたの言葉を視点タグに分けました。並び順はタグの一致数で決めています。</Text>}
    </View>}
    <View style={s.chips}>{topics.map((topic) => {
      const active = selected.includes(topic.id);
      return <Pressable key={topic.id} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`${topic.label}を${active ? '外す' : '選ぶ'}`}
        onPress={() => { setMessage(null); onChange(toggleTopic(selected, topic.id)); }} style={[s.chip, active && s.chipActive]}>
        <Text style={[s.chipText, active && s.chipTextActive]}>{topic.label}</Text>
      </Pressable>;
    })}</View>
  </View>;
}

const s = StyleSheet.create({
  card: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 18, padding: 16, marginTop: 18, gap: 10 },
  eyebrow: { color: c.muted, fontSize: 9, letterSpacing: 1.6, fontWeight: '700' },
  title: { fontSize: 16, fontWeight: '700', color: c.ink, lineHeight: 25 },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: c.paper, paddingHorizontal: 12, fontSize: 13, color: c.ink },
  ask: { minWidth: 64, minHeight: 44, borderRadius: 12, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  askText: { color: c.white, fontSize: 13, fontWeight: '700' },
  disabled: { opacity: .4 }, pressed: { opacity: .8 },
  message: { backgroundColor: '#EDF2DC', borderRadius: 12, padding: 12, gap: 6 },
  messageText: { color: c.ink, fontSize: 12, lineHeight: 20 },
  byline: { color: '#7D9465', fontSize: 9, lineHeight: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { borderRadius: 18, backgroundColor: c.light, paddingHorizontal: 12, minHeight: 32, justifyContent: 'center' },
  chipActive: { backgroundColor: c.ink },
  chipText: { fontSize: 11, color: c.ink, fontWeight: '600' },
  chipTextActive: { color: c.white },
});
