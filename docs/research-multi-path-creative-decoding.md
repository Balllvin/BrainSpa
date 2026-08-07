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

## Has This Been Done Before?

**Short answer:** most pieces already exist. Chunk-level multi-path search,
adaptive branching, late selection, and even thought aggregation are published
and have open-source code. What is *not* settled — and where Brain Spa can add
something real — is combining those pieces for **measurable creative quality**,
especially **recombination that beats picking a single winner**, on a classic
decoder with a honest cost curve.

### Prior-art map

| Idea in this note | Already studied as | Status |
|-------------------|--------------------|--------|
| Keep several futures instead of greedy next-token | Beam search; Best-of-N; Self-Consistency (CoT-SC) | Mature |
| Branch on **chunks / thoughts**, not only tokens | Tree of Thoughts (ToT) — thoughts are coherent text units | Mature, open source |
| Explore, score, backtrack | ToT BFS/DFS; LLM + MCTS; MCT Self-Refine | Mature-ish |
| **When** to branch vs commit | Entropy-Gated Branching (EGB); EDEN; Adaptive Beam Search | Recent (2025–2026), open source |
| Pull best parts together (not just pick one path) | Graph of Thoughts (GoT) **aggregation**; Self-Refine; multi-agent edit pipelines | GoT is the closest formal match |
| Multi-token / tree drafts | Medusa, EAGLE, DeepSeek-style MTP, speculative decoding | Mature for **speed**, not creativity |
| Extra encoder / heads over futures | Medusa heads; MTP modules; path scorers / PRMs | Exists for draft or reward, rarely for creative merge |
| Creative writing specifically | ToT creative-writing task (plan → passage + vote) | Exists but mostly **select**, not splice |

So: inventing “multi-path decode” from zero would duplicate ToT/beam/BoN.
Inventing “chunking” from zero would duplicate ToT/GoT’s thought unit.
The live research question is narrower and sharper:

> Can **entropy-gated, chunk-level branching + GoT-style aggregation** produce
> creative answers that beat **Best-of-N / ToT-select** at the same compute —
> and can Brain Spa prove that with harness artifacts?

### What is relatively underexplored

1. **Recombination vs selection for creativity.** GoT aggregates thoughts for
   sorting/keyword tasks; ToT creative writing usually *votes* among plans and
   passages. Cross-path **splice** that must stay coherent is thinner.
2. **Entropy gating + chunk grain + aggregation in one stack.** EGB/EDEN gate
   token/step expand for math/code; rarely wired to creative merge.
3. **Diversity-first tree drafts.** Medusa/EAGLE trees optimize acceptance for
   speed; using the same tree machinery for *divergent* creative options is
   secondary in those repos.
4. **Falsifiable creative harnesses** with recovery, splice-gain, and $/quality
   curves (Brain Spa’s Test stage strength) rather than vibes or single LLM
   judge scores.

## Open-Source Landscape (Practical Building Blocks)

Prefer standing on these rather than rewriting search from scratch.

### Thought / chunk search and merge

| Project | What it gives you | Link |
|---------|-------------------|------|
| **Tree of Thoughts** | Chunk-level branch, value/vote, BFS/DFS; includes a **creative writing** task | https://github.com/princeton-nlp/tree-of-thought-llm |
| **Graph of Thoughts** | Arbitrary thought graph + **aggregate** (combine advantages of several thoughts) — closest to “pull best parts together” | https://github.com/spcl/graph-of-thoughts |
| **MCTSr / mcts-llm** | MCTS over answer versions with self-critique / refine | https://github.com/BrendanGraham14/mcts-llm · https://github.com/trotsky1997/MathBlackBox |

### Adaptive “when to branch”

| Project | What it gives you | Link |
|---------|-------------------|------|
| **Entropy-Gated Branching (EGB)** | Branch only at high token entropy; PRM prune; large speedups vs fixed beam on math | https://github.com/JXL884/entropy_gated_branching |
| **Adaptive Beam Search (ABS)** | Entropy-guided adaptive beam for multi-step reasoning | https://github.com/yoongja/ABS |
| **EDEN** (paper) | Branching factor monotone in entropy; plug-and-play decode | arXiv:2605.09745 |

### Multi-token / tree draft (speed substrate; optional later)

| Project | What it gives you | Link |
|---------|-------------------|------|
| **Medusa** | Extra decode heads + tree attention; parallel candidate continuations | https://github.com/FasterDecoding/Medusa |
| **Speculative-Decoding catalog** | Side-by-side MTP, EAGLE-3, Medusa-1, draft models | https://github.com/shreyansh26/Speculative-Decoding |
| Serving engines | Production speculative / MTP paths (vLLM, SGLang, etc.) | use only if accelerating a proven quality policy |

### Multi-agent creative pipelines (orchestration, not decode)

Long-form systems (e.g. Novel-OS-style agent stacks) already draft → critique →
revise outside the token loop. Useful as a **baseline for “agent edit”**, but
they are not a replacement for studying decode-time multi-path on a classic LM.

## Recommended Way Forward

Do **not** start with a new encoder or Medusa-style heads. Start with
inference-time composition of existing open-source ideas, measure hard, then
only add architecture if recombination still wins under equal FLOPs.

### Phase 0 — Baselines (weeks of engineering, not invention)

On one small open decoder (local Hugging Face causal LM):

1. Greedy
2. Temperature / nucleus sample
3. Best-of-N (full answers, pick by self-vote or small judge)
4. ToT-select (reuse princeton-nlp prompts/search; creative writing + one
   constrained planning task)
5. GoT-aggregate (reuse spcl ops where the task admits aggregation)

Record quality, diversity, latency, and token expand count as Test artifacts.
If GoT-aggregate already dominates ToT-select and BoN on your creative metrics,
the “novel architecture” story shrinks — productize the controller instead.

### Phase 1 — Best immediate research stack (recommended)

Compose three existing ideas into one Brain Spa decode policy:

```text
entropy gate (EGB/EDEN)  →  chunk expand (ToT thought unit)
                           →  score / prune (vote, value, or small PRM)
                           →  aggregate (GoT merge) OR select (ToT/BoN)
```

Concrete defaults:

- **Branch unit:** sentence / paragraph / plan step (ToT thought), not every token.
- **Branch trigger:** high next-token (or first-token-of-chunk) entropy; else commit.
- **Width:** small (2–5) live chunks; hard budget on expansions.
- **Finish:** run **both** select and aggregate; the falsifier is whether
  aggregate’s **splice gain** > 0 at equal expand count.
- **Do not** train new heads until Phase 1 shows a stable win.

This is the highest-leverage path: prior work already proved each component;
almost nobody has published the full creative quality–cost curve for the combo.

### Phase 2 — Only if Phase 1 wins

1. Train a cheap **path/chunk preference** head from Brain Spa preference pairs
   (better than brittle self-vote).
2. Optional: Medusa/MTP-style **draft tree** retargeted for diversity (reject
   near-paraphrase siblings) to make branching cheaper — still quality-first.
3. Optional: thin **path-summary encoder** that conditions the merge step on
   sibling chunk embeddings (the “different encoder” idea) — only after plain
   GoT-style prompt aggregation plateaus.

### Phase 3 — Non-goals / traps

- Rewriting ToT/GoT from scratch without baselines.
- Calling Medusa “creative” because it explores a token tree (it optimizes speed).
- Spending budget on a custom encoder before splice-gain is measured.
- Shipping a persona demo; keep any future harness explicit and scored.

### Decision rule

| Result after Phase 1 | Next move |
|----------------------|-----------|
| Aggregate ≈ select at same cost | Creativity claim weak; ship adaptive branch + select as a Test policy |
| Aggregate > select at same cost | Invest in better merge (PRM / path encoder) |
| Adaptive branch ≈ fixed ToT width | Keep fixed width; entropy gate is optional polish |
| Nothing beats BoN | Multi-path is mostly parallel sampling; optimize BoN + judge |

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
   (Prior art strongly suggests starting with ToT-style thoughts.)
2. Does GoT-style aggregation beat ToT/BoN select on creative metrics at equal
   expand count? (Primary falsifier.)
3. Does entropy gating transfer from math (EGB/EDEN) to creative open-ended
   text, where baseline entropy is higher?
4. Can a path-summary encoder improve merge quality more than better prompting
   or a small preference head?
5. How do we prevent mode collapse where all branches paraphrase one idea?
6. Should critique paths use a different temperature / system prior / expert?
7. How much of “creativity” is search at inference vs training that rewards
   recoverable exploration?
8. What KV-sharing / trie layout keeps exponential branching practical?

## Non-Goals For This Note

- No new API routes, UI, or training code in this PR.
- No claim that branching alone equals creativity.
- No claim of a wholly new paradigm: ToT/GoT/EGB/Medusa already cover large
  parts; the bet is a measured composition aimed at creative splice-gain.
- No commitment to a single paper recipe in production — use them as toolkit
  baselines in Phase 0/1.

## Suggested First Experiment (When Implementation Starts)

Align with **Phase 0 → Phase 1** above. Smallest honest test on a classic
decoder LM, leaning on open-source ToT/GoT/EGB ideas rather than new weights:

1. Fixed prompts where early greed fails (ToT creative writing style + one
   planning/constraint task).
2. Baselines: greedy · nucleus · Best-of-N · ToT-select · GoT-aggregate.
3. Treatment: entropy-gated chunk branch (high-entropy only) + both select and
   aggregate finishes under a fixed expansion budget.
4. Log branch points, path scores, merge decisions, latency, expand count, and
   judge/harness scores as Test artifacts under `~/.brain-spa` — never commit
   weights or run dumps.
5. Apply the Phase 1 decision rule before any encoder or Medusa-head work.

That experiment answers the user’s question directly: does keeping multiple
**chunk** options open, then choosing or stitching later, produce better
creative answers than committing to the highest local probability — and is
that gain new relative to existing open-source search?
