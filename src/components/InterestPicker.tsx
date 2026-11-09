import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { apiConfigured, fetchInterests } from '../apiClient';
import { INTEREST_EXAMPLES, matchTopicsByKeywords, toggleTopic } from '../interests';
import { colors as c, radius, text as t } from '../theme';
import { Icon, Slant } from '../ui';
import type { Topic } from '../types';

export type InterestOutcome = { topicIds: string[]; reply: string | null; byGemini: boolean };

/** Free text -> topic IDs. Gemini through the server when connected; keyword matching otherwise or on any failure. */
export async function askInterest(text: string, topics: Topic[]): Promise<InterestOutcome> {
  const value = text.trim();
  try {
    if (!apiConfigured) throw new Error('offline');
    const result = await fetchInterests(value);
    return { topicIds: result.topicIds, reply: result.reply, byGemini: result.source === 'gemini' };
  } catch {
    return { topicIds: matchTopicsByKeywords(value, topics), reply: null, byGemini: false };
  }
}

function describe(outcome: InterestOutcome, topics: Topic[]) {
  if (outcome.topicIds.length === 0) return '当てはまる視点が見つかりませんでした。下のタグから選んでください。';
  const labels = topics.filter((topic) => outcome.topicIds.includes(topic.id)).map((topic) => `#${topic.label}`).join(' ');
  return `${outcome.reply ? `${outcome.reply}\n` : ''}${labels} の「？」を優先しました。`;
}

function Result({ outcome, topics }: { outcome: InterestOutcome; topics: Topic[] }) {
  return <View style={s.message} accessibilityLiveRegion="polite">
    <Text style={[t.std16N170, { color: c.white }]}>{describe(outcome, topics)}</Text>
    {outcome.byGemini && <Text style={[t.note14N150, { color: c.mist }]}>Geminiが言葉を視点に分けました。並び順は、視点が一致した数で決めています。</Text>}
  </View>;
}

type Props = { topics: Topic[]; selected: string[]; onChange: (topicIds: string[]) => void };

/** Sample words for the first-run guide: one tap runs the same Gemini classification as the free-text box. */
export function InterestExamples({ topics, onChange }: Omit<Props, 'selected'>) {
  const [busy, setBusy] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<InterestOutcome | null>(null);

  async function pick(example: string) {
    if (busy) return;
    setBusy(example);
    setOutcome(null);
    const result = await askInterest(example, topics);
    setBusy(null);
    setPicked(example);
    setOutcome(result);
    if (result.topicIds.length) onChange(result.topicIds);
  }

  return <View style={{ gap: 8 }}>
    <View style={s.chips}>{INTEREST_EXAMPLES.map((example) => {
      const active = picked === example;
      return <Pressable key={example} accessibilityRole="radio" accessibilityState={{ checked: active }} aria-checked={active} accessibilityLabel={`「${example}」で選ぶ`}
        onPress={() => void pick(example)} disabled={Boolean(busy)} style={[s.chip, active && s.chipActive]}>
        {busy === example ? <ActivityIndicator color={c.white} size="small" /> : active && <Icon name="check" color={c.white} size={16} />}
        <Text style={[active ? t.note14B150 : t.note14N150, { color: active ? c.white : c.mist }]}>{example}</Text>
      </Pressable>;
    })}</View>
    {outcome && <Result outcome={outcome} topics={topics} />}
  </View>;
}

/** Free text goes to Gemini (via the server) and comes back as fixed topic tags; tags can also be picked directly. */
export default function InterestPicker({ topics, selected, onChange }: Props) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState<InterestOutcome | null>(null);
  const ready = Boolean(text.trim()) && !loading;

  async function ask(value = text) {
    if (!value.trim() || loading) return;
    setLoading(true);
    setOutcome(null);
    const result = await askInterest(value, topics);
    setLoading(false);
    setOutcome(result);
    if (result.topicIds.length) onChange(result.topicIds);
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
    <View style={s.examples}>
      <Text style={[t.note14N150, { color: c.muted }]}>例：</Text>
      {INTEREST_EXAMPLES.map((example) => <Pressable key={example} accessibilityRole="button" accessibilityLabel={`「${example}」で探す`} disabled={loading}
        onPress={() => { setText(example); void ask(example); }} style={({ pressed }) => [s.example, pressed && { opacity: .7 }]}>
        <Text style={[t.note14N150, s.exampleText]}>{example}</Text>
      </Pressable>)}
    </View>
    {outcome && <Result outcome={outcome} topics={topics} />}
    <View style={s.chips}>{topics.map((topic) => {
      const active = selected.includes(topic.id);
      return <Pressable key={topic.id} accessibilityRole="checkbox" accessibilityState={{ checked: active }} aria-checked={active} accessibilityLabel={topic.label}
        onPress={() => { setOutcome(null); onChange(toggleTopic(selected, topic.id)); }} style={[s.chip, active && s.chipActive]}>
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
  examples: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 4, rowGap: 2 },
  example: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 6 },
  exampleText: { color: c.link, textDecorationLine: 'underline' },
  message: { borderLeftWidth: 4, borderLeftColor: c.red, backgroundColor: c.navyRaised, padding: 12, gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.full, borderWidth: 1, borderColor: c.line, backgroundColor: c.navy, paddingHorizontal: 12, minHeight: 40 },
  chipActive: { backgroundColor: c.red, borderColor: c.red },
});
