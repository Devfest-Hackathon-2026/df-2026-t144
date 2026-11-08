import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { apiConfigured, fetchTeaser } from '../apiClient';
import { colors as c, text as t } from '../theme';
import type { Spot } from '../types';

// One request per (from, to, topics) per app session.
const cache = new Map<string, Promise<string | null>>();

function loadTeaser(from: string, to: string, topicIds: string[]) {
  const key = `${from}>${to}>${[...topicIds].sort().join(',')}`;
  if (!cache.has(key)) {
    cache.set(key, fetchTeaser(from, to, topicIds).then((result) => (result.source === 'gemini' ? result.text : null), () => null));
  }
  return cache.get(key)!;
}

/** The line under an undiscovered related "?". Gemini tunes it to the user's topics; the fixed note is the fallback. */
export default function RelatedTeaser({ from, to, topicIds }: { from: Spot; to: Spot; topicIds: string[] }) {
  const fixed = from.relatedNotes[to.id] ?? to.hint;
  const [generated, setGenerated] = useState<string | null>(null);
  const topicsKey = topicIds.join(',');
  useEffect(() => {
    setGenerated(null);
    if (!apiConfigured) return;
    let alive = true;
    void loadTeaser(from.id, to.id, topicIds).then((text) => { if (alive) setGenerated(text); });
    return () => { alive = false; };
    // topicsKey stands in for topicIds so a new array with the same topics does not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from.id, to.id, topicsKey]);
  return <View style={s.wrap}>
    <Text style={[t.std16N170, { color: c.ink }]}>{generated ?? fixed}</Text>
    {generated && <Text style={[t.note14N150, { color: c.sepia }]}>Geminiが、出典を確認した事実だけで作った一文です。</Text>}
  </View>;
}

const s = StyleSheet.create({
  wrap: { gap: 4 },
});
