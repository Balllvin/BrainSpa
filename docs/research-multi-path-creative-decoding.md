# Research Direction: Multi-Path Creative Decoding

Status: **proposal only**. No implementation in this document. The goal is to
name a research direction Brain Spa can later test: make a classic transformer
**genuinely creative** by exploring several futures during decode, then
assembling the best answer from the strongest parts.

This sits under the language-model path in [ml-model-types.md](ml-model-types.md).
It does not change the Evidence → Datasets → Tune → Test loop today.

## The Core Idea

Standard autoregressive decode is mostly local:

1. Condition on the prefix.
2. Score the next-token distribution.
3. Pick one token (greedy, sample, or a small beam).
4. Commit. Repeat.

That works for fluency. It is weak for creativity and for problems where the
**early** choice looks fine and the **later** consequence reveals it was wrong.

The research bet:

> At selected moments, expand **multiple candidate continuations** (tokens,
> phrases, or thought chunks). Keep them alive long enough that later context
> can judge which path — or which **fragments across paths** — actually produce
> the best answer. Then merge or select.

Compute grows with branching. The interesting work is **when** to branch,
**what unit** to branch on, and **how** to recombine winners without turning
decode into an expensive random walk.

```text
prefix
  ├─ path A ── chunk ── chunk ── … ── candidate answer A
  ├─ path B ── chunk ── …           ── candidate answer B
  └─ path C ── …                    ── candidate answer C
                 │
                 ▼
         select / splice / rescore
                 │
                 ▼
            final answer
```

Creativity here means **structured exploration plus late judgment**, not higher
temperature alone. Temperature widens one local draw. Multi-path decode keeps
several coherent worlds open and then edits across them.

## What Classic Transformers Already Give Us

A decoder-only transformer already emits a full next-token distribution and can
batch many prefixes. That is enough to prototype:

| Primitive | Role in this direction |
|-----------|------------------------|
| Softmax over vocab | Local candidates to branch on |
| KV cache | Cheap continuation of each live path |
| Batched forward | Score many prefixes in one pass |
| Log-prob / entropy | Signals for “branch here” vs “commit” |
| Cross-attention / encoder (encoder–decoder) | Optional separate “judge” or “planner” stack over path summaries |

Nothing in the classic stack forces single-path greed. Greedy decode is a
**policy**, not an architectural law. The research is a better decode (and
eventually train) policy on top of the same backbone — and, later, small
architectural add-ons that make multi-path thinking native.

## Lessons From Newer LLM Work

Borrow mechanisms; do not copy product branding. Modern systems already move
away from pure token-greedy commit in several ways.

### 1. Beam search and trie / shared-prefix decode

Beam search keeps top-k sequences and can recover from a locally mediocre
token if a later sequence scores better. Cost and memory grow with beam width.
Recent trie-style decode shares KV state across overlapping prefixes so beams
are less wasteful.

**Takeaway:** multi-path is already useful for quality; engineering must share
compute across siblings, not fork full models naively.

### 2. Speculative and tree draft decode

Draft models (or draft heads) propose several future tokens; the target verifies
them in parallel. Tree drafts explore several short futures at once. This is
usually for **speed**, not creativity, but the machinery — draft trees, tree
attention, accept/reject — is exactly the substrate for “try several options,
keep what survives later judgment.”

**Takeaway:** treat branching as a first-class decode graph with shared
verification, not as N independent generations.

### 3. Thought-level search (Tree of Thoughts, MCTS over thoughts)

Instead of branching on every token, branch on **coherent units**: a sentence,
a plan step, a scene beat, a tool call. Search (BFS, DFS, MCTS) expands,
scores, prunes, and backtracks. This matches the user’s intuition that a
“chunk” may be the right branching grain.

**Takeaway:** for creativity and hard reasoning, **adaptive chunk boundaries**
matter more than raw beam width at every token.

### 4. Lookahead / step-level speculation on reasoning models

Long chain-of-thought models spend thousands of tokens. Step-level speculation
proposes future **reasoning steps**, verifies them semantically, and only then
commits. Token-level and step-level parallelism can stack.

**Takeaway:** “later you realize this was the right choice” is already a live
research pattern; creativity work should reuse step-level accept/reject, not
only token match.

### 5. Multi-token prediction and parallel heads

Some training recipes predict several future tokens at once. That teaches the
model a short horizon of futures rather than a single next token.

**Takeaway:** a dedicated multi-future head (or encoder over path summaries)
could propose branch points and candidate chunks natively, instead of only
sampling from the vanilla next-token head.

### 6. Best-of-N and self-consistency

Sample many full answers; pick by vote, reward model, or verifier. Simple and
strong, but usually **whole-answer** selection — it rarely **splices** the best
paragraph from run A with the best ending from run B.

**Takeaway:** selection is the baseline. The creative leap is **recombination**:
pull best parts together under a consistency constraint.

### 7. Mixture-of-Experts and specialized workers

MoE routes tokens to different experts. Brain Spa already separates Source /
Data / Training / Harness workers. Multi-path decode can mirror that: one path
set for divergent ideation, another for critique, another for merge.

**Takeaway:** path roles can differ. Not every branch should optimize the same
objective.

## Proposed Research Stack (Conceptual)

Three layers, still compatible with a classic transformer backbone.

### A. Branch controller (when to fork)

Decide online whether the next step is:

- **Commit** — single continuation (cheap).
- **Local branch** — top-k tokens or short phrases.
- **Chunk branch** — generate several thought/paragraph candidates.
- **Collapse** — prune to one path or merge fragments.

Signals (examples, not prescriptions):

- High entropy / flat top-k → ambiguity → branch.
- High stakes tokens (names, numbers, plot turns, tool args) → branch.
- Low entropy after a plan lock → commit.
- Budget remaining (latency, tokens, GPU) → force collapse.

### B. Path memory (what to keep)

Each live path stores:

- prefix tokens + KV cache slice (or shared trie node)
- path score (model log-prob, verifier, reward head)
- optional role tag (`ideate`, `critic`, `safe`, `wild`)
- chunk boundaries for later splice points

### C. Synthesis (how to finish)

Three escalating merge policies:

1. **Select** — pick the best full path (best-of-N / beam winner).
2. **Rescore with lookahead** — continue each survivor a few chunks; then pick.
3. **Recombine** — align chunk boundaries across paths; build a new prefix from
   best-scoring compatible chunks; optionally re-decode a short glue region so
   the splice is grammatical and fact-consistent.

Recombination is the distinctive creative claim: the model is not only a
sampler; it is an **editor over its own parallel drafts**.

## Architectural Options To Study

Ordered from least invasive to most.

1. **Decode-only multi-path** on a frozen classic LM  
   Beam / ToT / MCTS / adaptive branch controller. Fastest to prototype in
   Brain Spa Test harnesses.

2. **Verifier / preference head**  
   Train or attach a small scorer that ranks paths and chunk splices (pairs
   naturally into Brain Spa Datasets preference rows).

3. **Multi-future draft head**  
   Extra heads predict short continuation trees; target path verifies — like
   speculative trees, but optimized for diversity + quality, not only speed.

4. **Path-summary encoder**  
   A thin encoder (or cross-attention block) over summaries of sibling paths
   so the decoder can condition on “what the other options were” when merging.
   This is the user’s “different encoder to reflect this” idea: the encoder
   does not replace the LM; it represents the **set of open futures**.

5. **Train-time multi-path objectives**  
   Expose the model to several valid futures per prefix; reward late recovery
   and successful splices so exploration is not only an inference hack.

## Creativity Criteria (Falsifiable)

Do not treat “sounds creative” as success. Measure against single-path
baselines (greedy, temperature sample, fixed beam, best-of-N without splice):

| Criterion | Example measure |
|-----------|-----------------|
| Recovery | Rate of fixing an early locally-preferred but globally-bad choice |
| Diversity under quality | Distinct useful drafts before collapse, not gibberish |
| Splice gain | Recombined answer beats every individual path on a judge/harness |
| Budget curve | Quality vs FLOPs / latency as branch factor and chunk size change |
| Controllable branch | Adaptive controller beats fixed branch-every-token at same cost |

If recombination never beats best-of-N at equal compute, the creative claim
fails and the work collapses to cheaper search — still useful, but narrower.

## Fit In Brain Spa (Later, Not Now)

When this moves from research note to experiment:

| Loop stage | Possible artifact |
|------------|-------------------|
| Evidence | Cases where single-path decode fails but multi-path recovers |
| Datasets | Preference pairs over paths; splice accept/reject rows; branch-point labels |
| Tune | Dry-run of branch controller; optional verifier / draft-head adapters |
| Test | Harness that scores recovery, diversity, splice quality, and cost |

Chipmunk / resident workers stay operators of the loop. Multi-path decode is a
**generation policy** under Test (and later Tune), not a fifth product pillar.

Public shell reminder: do not invent a persona demo around this. Keep any
future harness explicit, artifact-driven, and measurable.

## Open Questions

1. Is the right branch unit token, subword span, sentence, or learned chunk?
2. Can a path-summary encoder improve merge quality more than extra samples?
3. How do we prevent mode collapse where all branches paraphrase one idea?
4. Should critique paths use a different temperature / system prior / expert?
5. How much of “creativity” is search at inference vs training that rewards
   recoverable exploration?
6. What KV-sharing / trie layout keeps exponential branching practical?

## Non-Goals For This Note

- No new API routes, UI, or training code in this PR.
- No claim that branching alone equals creativity.
- No commitment to a specific paper recipe (beam vs ToT vs MCTS vs speculative
  trees). Those are toolkits for the experiments above.

## Suggested First Experiment (When Implementation Starts)

Smallest honest test on a classic decoder LM:

1. Fixed prompts where early greed fails (ambiguous creative writing, planning,
   constrained generation).
2. Adaptive top-k branch only at high-entropy steps; commit elsewhere.
3. Chunk every N tokens or at punctuation; keep B paths.
4. Compare: greedy · temperature · best-of-N · multi-path select · multi-path
   recombine.
5. Log branch points, path scores, splice decisions, latency, and judge scores
   as Test artifacts under `~/.brain-spa` — never commit weights or run dumps.

That experiment answers the user’s question directly: does keeping multiple
options open, then choosing (and stitching) later, produce better creative
answers than committing to the highest local probability at every step?
