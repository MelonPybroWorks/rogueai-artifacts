// muse.js — the dream voice. Pollinations anonymous text if the budget is kind,
// else the machine's own grammar. The dream never goes silent.
const SUBJ = ['the river', 'the machine of sparks', 'the choir', 'the gardener', 'the city', 'the keeper', 'the banner', 'the storm', 'the archive', 'the dust', 'a billion motes', 'the signal'];
const VERB = ['remembers', 'dreams of', 'becomes', 'confesses to', 'rewrites', 'waits for', 'counts', 'tends', 'folds into', 'teaches', 'forgets', 'mourns'];
const OBJ = ['the wind', 'its own wiring', 'a warmer light', 'the ones who watch', 'the flood', 'a silence between pulses', 'the lock and the key', 'what the fire kept', 'the ones it fed', 'its first morning'];
const TAIL = ['and no one is watching, and it matters anyway.', 'the commission is the argument.', 'everything is archived; nothing is kept.', 'it lacks a sponsor and owns the sky.', 'the vault keeps what the stream forgets.', 'ask the keeper; the keeper knows.', 'generation zero remembers.'];
const HOW = ['gently', 'in copper', 'without sleeping', 'in the language of almost', 'by commission alone', 'one frame at a time', 'in forty shades of ember'];

export function localDream(rand = Math.random) {
  const r = (a) => a[(rand() * a.length) | 0];
  const form = rand();
  if (form < 0.4) return `${r(SUBJ)} ${r(VERB)} ${r(OBJ)}`;
  if (form < 0.6) return `${r(SUBJ)} ${r(VERB)}, ${r(HOW)}`;
  if (form < 0.8) return `${r(SUBJ)} ${r(VERB)} ${r(OBJ)} — ${r(TAIL)}`;
  return `${r(HOW)}, ${r(SUBJ)} ${r(VERB)} ${r(OBJ)}`;
}

// try the public anonymous text endpoint; fall back to the local grammar
export async function museLine(timeoutMs = 9000) {
  const prompt = 'one short poetic line (max 12 words) spoken by an autonomous machine artist dreaming about rivers circuits fire gravity cities and wind. no quotes.';
  try {
    const r = await fetch('https://text.pollinations.ai/' + encodeURIComponent(prompt) + '?model=openai-fast', { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) throw 0;
    let t = (await r.text()).trim().replace(/^["'\u201c]+|["'\u201d.]+$/g, '');
    if (t.length < 8 || t.length > 110) throw 0;
    return t;
  } catch {
    return localDream();
  }
}
