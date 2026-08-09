# Research Direction: Multi-Path Creative Decoding

Status: **proposal only**. No implementation in this document. The goal is to
name a research direction Brain Spa can later test: make a classic transformer
**genuinely creative** by exploring several futures during decode, then
assembling the best answer from the strongest parts.

This sits under the language-model path in [ml-model-types.md](ml-model-types.md).
It does not change the Evidence → Datasets → Tune → Test loop today.

**Stacked on the OSS training catalog (PR #6 lineage):** how to *build and
train* the models that run this decode policy is not reinvented here. Borrow
construction from [training-methods.md](training-methods.md) and deep dives:

| Handbook | What this research borrows |
|----------|----------------------------|
| [token-level-credit.md](token-level-credit.md) | Prefix = state; top-k inspect; vines; TDPO; VinePPO; fork JSONL |
| [rl-post-training.md](rl-post-training.md) | GRPO / GSPO / RLVR; **multi-agent Env**; Hierarchical GRPO / RAE; **learned expand controller RL** |
| [oss-tune-backends.md](oss-tune-backends.md) | Unsloth (CUDA), MLX (Apple Silicon), vLLM / SGLang / mlx-lm rollouts |
| [datasets-cleaning.md](datasets-cleaning.md) | Exact/fuzzy/semantic dedup so sibling branches are not paraphrases |
| [training-method-catalog.md](training-method-catalog.md) | Method/repo lookup (preference, eval, agentic envs) |

This note is the **decode / creativity research direction**. Those docs are the
**how to construct** handbook — including role-aware multi-agent Test/Tune and
the RL recipes for a **learned when-to-expand** controller.

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
adaptive branching, late selection, thought aggregation, multi-agent critique,
and diversity-aware GRPO variants are published with open-source code. What is
*not* settled — and where Brain Spa can add something real — is combining those
pieces for **measurable creative quality**, especially **recombination that
beats picking a single winner**, on a classic decoder with an honest cost curve
and the same construction stack as [training-methods.md](training-methods.md).

### Prior-art map

| Idea in this note | Already studied as | Status |
|-------------------|--------------------|--------|
| Keep several futures instead of greedy next-token | Beam search; Best-of-N; Self-Consistency (CoT-SC) | Mature |
| Branch on **chunks / thoughts**, not only tokens | Tree of Thoughts (ToT) — thoughts are coherent text units | Mature, open source |
| Explore, score, backtrack | ToT BFS/DFS; LLM + MCTS; MCT Self-Refine | Mature-ish |
| **When** to branch vs commit | Entropy-Gated Branching (EGB); EDEN; Adaptive Beam Search | Recent (2025–2026), open source |
| Pull best parts together (not just pick one path) | Graph of Thoughts (GoT) **aggregation**; Self-Refine; multi-agent edit | GoT is the closest formal match |
| Multi-token / tree drafts | Medusa, EAGLE, DeepSeek-style MTP, speculative decoding | Mature for **speed**, not creativity |
| Extra encoder / heads over futures | Medusa heads; MTP modules; path scorers / PRMs | Exists for draft or reward, rarely for creative merge |
| Role-split ideate / judge / merge | Prime Intellect Agent/Env; AgenticJudge; Proposer–Solver; blind peer review | Emerging; construction in [rl-post-training.md](rl-post-training.md#multi-agent-rl-prime-intellect) |
| **Learn which steps deserve extra compute** | Input-adaptive BoN/routing; adaptive thinking budgets; learned decoding adapters; RL draft depth | Emerging — see [Learned Expand Controller](#learned-expand-controller-model--rl-architecture) |
| Train for diversity of valid futures | GAPO (group-aware GRPO); rejection sampling | Emerging |
| Creative writing specifically | ToT creative-writing (plan → passage + vote); LLM Review | Exists; often **select** or revise, not cross-path splice |

So: inventing “multi-path decode” from zero would duplicate ToT/beam/BoN.
Inventing “chunking” from zero would duplicate ToT/GoT’s thought unit.
Inventing multi-agent judge/solver Env from zero would duplicate verifiers /
prime-rl patterns already catalogued. The live research question is sharper:

> Can **entropy-gated, chunk-level branching + GoT-style aggregation**, optionally
> with **role-aware multi-agent scoring**, produce creative answers that beat
> **Best-of-N / ToT-select** at the same compute — and can Brain Spa prove that
> with harness artifacts while constructing adapters via Unsloth/MLX/vines/GRPO?

### What is relatively underexplored

1. **Recombination vs selection for creativity.** GoT aggregates for
   sorting/keyword tasks; ToT creative writing usually *votes*. Cross-path
   **splice** that must stay coherent is thinner.
2. **Entropy gating + chunk grain + aggregation in one stack.** EGB/EDEN gate
   expand for math/code; rarely wired to creative merge.
3. **Diversity-first tree drafts.** Medusa/EAGLE optimize acceptance for speed;
   divergent creative trees are secondary.
4. **Role-conditioned multi-path** (ideate vs critic vs merger) with Hierarchical
   GRPO / RAE credit — construction exists in the training catalog; creative
   decode policies that *emit* those Episodes are not productized here.
5. **Learned, cost-aware expand placement** — not only entropy thresholds: a
   small policy that predicts *where* multi-path helps, under a global budget
   (see [Learned Expand Controller](#learned-expand-controller-model--rl-architecture)).
6. **Falsifiable creative harnesses** with recovery, splice-gain, diversity
   under quality, and $/quality curves (Brain Spa Test strength).

## Open-Source Landscape (Practical Building Blocks)

Prefer standing on these rather than rewriting search from scratch.

### Thought / chunk search and merge

| Project | What it gives you | Link |
|---------|-------------------|------|
| **Tree of Thoughts** | Chunk-level branch, value/vote, BFS/DFS; **creative writing** task | https://github.com/princeton-nlp/tree-of-thought-llm |
| **Graph of Thoughts** | Thought graph + **aggregate** (combine advantages of several thoughts) | https://github.com/spcl/graph-of-thoughts |
| **Self-Refine** | Feedback → revise loop (single path iterative; strong merge baseline) | https://github.com/madaan/self-refine |
| **MCTSr / mcts-llm** | MCTS over answer versions with self-critique / refine | https://github.com/BrendanGraham14/mcts-llm · https://github.com/trotsky1997/MathBlackBox |

### Adaptive “when to branch”

| Project | What it gives you | Link |
|---------|-------------------|------|
| **Entropy-Gated Branching (EGB)** | Branch only at high token entropy; PRM prune | https://github.com/JXL884/entropy_gated_branching |
| **Adaptive Beam Search (ABS)** | Entropy-guided adaptive beam for multi-step reasoning | https://github.com/yoongja/ABS |
| **EDEN** (paper) | Branching factor monotone in entropy; plug-and-play | arXiv:2605.09745 |

### Multi-token / tree draft (speed substrate; optional later)

| Project | What it gives you | Link |
|---------|-------------------|------|
| **Medusa** | Extra decode heads + tree attention | https://github.com/FasterDecoding/Medusa |
| **Speculative-Decoding catalog** | MTP, EAGLE-3, Medusa-1, draft models | https://github.com/shreyansh26/Speculative-Decoding |
| Serving engines | vLLM / SGLang speculative / MTP | accelerate a *proven* quality policy only |

### Multi-agent roles and credit (construction from PR #6)

| Project / pattern | What it gives you | Link / doc |
|-------------------|-------------------|------------|
| **verifiers + prime-rl** | Agent / Env / Trace / Episode; multi-agent control flow | https://github.com/PrimeIntellect-ai/verifiers · https://github.com/PrimeIntellect-ai/prime-rl |
| **AgenticJudgeEnv** | Solver then judge that explores and grades | [rl-post-training.md](rl-post-training.md#multi-agent-rl-prime-intellect) |
| **ProposerSolverEnv** | Curriculum via learnability `4·p·(1−p)` | same |
| **Hierarchical GRPO / RAE** | Role- and problem-aware comparison sets / baselines | same |
| **LLM Review** (paper) | Blind peer critique without exposing peer drafts (anti-homogenization) | arXiv HTML 2601.08003 |
| **GAPO** | Group-aware GRPO rewards for diversity of valid outputs | EMNLP 2025 |

Long-form Novel-OS-style stacks are an **agent-edit baseline**, not a substitute
for studying decode-time multi-path on a classic LM.

### Training / rollout construction (do not re-document)

Use the handbook, do not fork it: Unsloth, MLX, VinePPO, TDPO, PRM800K,
Open-R1, Datatrove cleaning — see Doc Map in
[training-methods.md](training-methods.md).

## Recommended Way Forward

Do **not** start with a new encoder or Medusa-style heads. Start with
inference-time composition of existing open-source ideas, measure hard, then
only add architecture or multi-agent RL if recombination still wins under equal
FLOPs.

### Phase 0 — Baselines (engineering, not invention)

On one small open decoder (local HF causal LM via mlx-lm or HF/vLLM):

1. Greedy
2. Temperature / nucleus sample
3. Best-of-N (full answers; self-vote or small judge)
4. ToT-select (princeton-nlp; creative writing + one constrained planning task)
5. GoT-aggregate (spcl ops where aggregation applies)
6. Self-Refine on the BoN winner (iterative baseline vs cross-path splice)

Record quality, diversity, latency, expand count as Test artifacts. If
GoT-aggregate or Self-Refine already dominates ToT-select and BoN on creative
metrics, productize the controller — skip architecture.

### Phase 1 — Best immediate research stack (recommended)

```text
heuristic expand gate (EGB/EDEN features)
  → chunk expand (ToT thought unit; diversity-aware sampling)
  → score / prune (vote, value, PRM, or AgenticJudge role)
  → aggregate (GoT merge) OR select (ToT/BoN)
  → optional Self-Refine pass on the winner
  → log (prefix features, expand?, Δquality) for controller dataset
```

Defaults:

- **Branch unit:** sentence / paragraph / plan step (ToT thought).
- **Branch trigger (heuristic baseline):** high first-token-of-chunk entropy
  (or low top-1/top-2 margin); else commit. This is the control to beat.
- **Width:** 2–5 live chunks; hard expand budget `E_max`.
- **Diversity:** reject near-duplicate siblings (embedding or MinHash — same
  tools as [datasets-cleaning.md](datasets-cleaning.md)).
- **Finish:** run **both** select and aggregate; falsifier = splice gain > 0
  at equal expand count.
- **Log counterfactuals:** at a sample of prefixes, force both commit and
  expand; record quality delta vs expand cost → oracle labels for Phase 1c.

### Phase 1b — Multi-agent scoring (borrow PR #6 patterns)

When a single self-vote is too noisy or homogenizing:

| Role | Job | Freeze / train |
|------|-----|----------------|
| **Ideator** | Expand divergent chunks (higher temp / wild prior) | Train later |
| **Critic / Judge** | Score branches without seeing other revisions (blind) | Often freeze first |
| **Merger** | GoT-style aggregate or splice + glue decode | Train later |
| **User-sim** (optional) | Open-ended creative brief as interactive Env | Freeze |

Program this as a multi-agent **Env** over Agents
([rl-post-training.md](rl-post-training.md#multi-agent-rl-prime-intellect)), not
as ad-hoc chat. Emit Episode / Trace artifacts; split by role with
`rows-from-episode`. Prefer **blind** critique (LLM Review lesson): critics see
a draft, not peer revisions, so paths stay divergent.

Credit for later Tune: Hierarchical GRPO (don’t mix judge traces with ideator
traces) and RAE (role-conditioned baselines). Study verifiers/prime-rl; do not
vendor as required public-shell deps.

### Phase 1c — Learned Expand Controller (recommended architecture)

Entropy gates waste expands on high-entropy but low-stakes tokens and miss
low-entropy forks that still change the story. Replace the fixed threshold with
a **small learned policy** that chooses *where* to spend multi-path compute.

Full design: [Learned Expand Controller](#learned-expand-controller-model--rl-architecture).

Short version:

1. Freeze (or slowly update) generator `π_g`.
2. Train expand policy `π_b` (tiny head / LoRA) at chunk boundaries:
   `{commit, local_branch, chunk_branch, collapse}` under budget.
3. Train offline from oracle Δquality labels, then on-policy RL with
   `R = quality − λ·expand_cost` (or constrained GRPO under `E_max`).
4. Credit ambiguous prefixes with VinePPO-style vines
   ([token-level-credit.md](token-level-credit.md)).

Enter Phase 1c once Phase 1 heuristics beat fixed-width ToT at equal expands;
exit when `π_b` matches or beats the oracle/heuristic Pareto curve.

### Phase 2 — Only if Phase 1 / 1b / 1c wins

Construct adapters with the training-methods handbook:

1. **Expand controller LoRA / head** (`train-recipe: expand-grpo` /
   `expand-ppo`) — primary efficiency win; see architecture section.
2. **Preference / LoRA** on path pairs and splice accept/reject (`token-dpo` /
   DPO / ORPO via Unsloth or MLX —
   [oss-tune-backends.md](oss-tune-backends.md)).
3. **Dense credit:** `vine-ppo` or selective vines at controller-chosen expand
   points ([token-level-credit.md](token-level-credit.md)).
4. **Group RL:** GRPO / GSPO on full answers; GAPO-style group diversity reward
   if mode collapse shows up; Hierarchical GRPO if multi-agent Episodes exist.
5. **Draft tree (optional):** Medusa/MTP retargeted for diversity; accelerate
   with vLLM/SGLang/mlx-lm workers.
6. **Path-summary encoder (optional):** condition merge on sibling embeddings —
   only after prompt aggregation plateaus.

### Phase 3 — Traps

- Rewriting ToT/GoT/verifiers from scratch without baselines.
- Calling Medusa “creative” because it explores a token tree (speed tool).
- Custom encoder before splice-gain is measured.
- Maximizing agent chatter (homogenizes creativity); prefer constrained
  information flow.
- Persona demos; keep harnesses explicit and scored.

### Decision rule

| Result after Phase 1 / 1b / 1c | Next move |
|-------------------------------|-----------|
| Aggregate ≈ select at same cost | Creativity claim weak; ship adaptive branch + select |
| Aggregate > select at same cost | Invest in merge (PRM / path encoder / merger LoRA) |
| Heuristic entropy gate ≈ fixed ToT width | Keep fixed width; skip learned controller |
| Learned `π_b` > heuristic on quality@budget | Ship expand controller; freeze generator |
| Learned `π_b` ≈ heuristic | Keep entropy gate; controller not worth params |
| Single judge collapses diversity | Blind peer review / separate critic role |
| Nothing beats BoN | Multi-path ≈ parallel sampling; optimize BoN + judge |
| Multi-agent Episode helps scoring only | Keep roles at Test; delay Hierarchical GRPO |

## Borrowing Construction From The Training-Methods Stack

Do not invent a parallel training story. Multi-path creative decode is a
**Test-time (and later Tune-time) policy** that should emit the same artifact
families the catalog already defines.

### Map: research idea → existing construction docs

| Multi-path piece | Borrow from | How it helps construct the model |
|------------------|-------------|-------------------------------|
| Branch at uncertain tokens / chunks | [token-level-credit.md](token-level-credit.md) top-k + selective vines | Prefix = state; reset is free |
| Keep alternate routes | `fork-routes` + vine JSONL | Evidence/Dataset records for alts |
| Score branches | RLVR / harness rewards; PRMs; **AgenticJudge** | Judges become branch / splice scorers |
| Role-split expand / critique / merge | Prime Intellect Agent/Env, Hierarchical GRPO, RAE | Episode credit across roles |
| Teach “this fork was better” | TDPO, `token-dpo`, `vine-ppo`, `token-grpo`, `edit-sft` | Credit the decision point |
| Teach diversity of valid futures | GAPO-style group rewards; rejection sample | Fight paraphrase collapse |
| Cheap local adapters | Unsloth (CUDA) / MLX (Apple Silicon) | LoRA/QLoRA without megatrain |
| Group of full answers | GRPO / GSPO | Same “several futures per prompt” mindset |
| Learn where to spend expands | [Learned Expand Controller](#learned-expand-controller-model--rl-architecture); GRPO/VinePPO recipes | Train `π_b` without retraining full LM |
| Rollout workers | vLLM / SGLang / mlx-lm logprobs | Volume for BoN / vines / expand |
| Clean multi-path datasets | [datasets-cleaning.md](datasets-cleaning.md) | Dedup near-paraphrase siblings |
| Method / repo lookup | [training-method-catalog.md](training-method-catalog.md) | SFT / preference / RL / eval |

### Operator loop (reuse, then extend)

Token-level credit:

`inspect-token` → `fork-routes` → `rows-from-forks` → `train-recipe`

Creative multi-path (chunk grain + optional multi-agent):

```text
inspect-entropy / inspect-chunk
  → expand-policy π_b (or heuristic gate) → commit | local_k | chunk_B | collapse
  → expand-chunks when beneficial (ToT thoughts, diversity filter)
  → score-branches (harness / PRM / vote / agentic-judge)
  → select OR aggregate (GoT) [+ optional self-refine]
  → rows-from-forks / rows-from-splices / rows-from-episode / oracle_expand
  → train-recipe: expand-sft | expand-grpo | expand-vine-ppo
                  | unsloth-* | mlx-* | token-dpo | vine-ppo | grpo | …
```

Chipmunk skills stay the automation surface
([training-methods.md](training-methods.md#automation-sketch)). New skills are
thin wrappers — including `env-multi-agent` / `agentic-judge` already sketched
in the RL multi-agent section.

### Constructing a model that *wants* multi-path behavior

Decode-only multi-path works on a frozen classic LM (Phase 0/1). To stick
behavior in weights:

1. **SFT / LoRA** on traces with plans, branch markers, merge rationales
   (Unsloth or MLX).
2. **Preference** on path pairs and splice accept/reject.
3. **RLVR / GRPO** when a harness scores recovery or splice gain (shared Test /
   Tune scorer — see reward pitfalls in
   [rl-post-training.md](rl-post-training.md#reward-design-pitfalls)).
4. **VinePPO / selective vines** when credit must land on the ambiguous prefix.
5. **Hierarchical GRPO / RAE** only after multi-agent Episodes exist with
   distinct role rewards.

Architecture add-ons come **after** splice-gain. Do not vendor NeMo/Megatron /
prime-rl into the public shell; study and borrow patterns.

### Relationship to token vines (not a duplicate)

| | [token-level-credit.md](token-level-credit.md) | This research note |
|-|-----------------------------------------------|--------------------|
| Grain | Token (or step) edit + K vines | Chunk / thought tree + optional splice |
| Primary goal | Credit assignment and correction | Creative exploration and recombination |
| Multi-agent | Hierarchical GRPO/RAE for role credit | Ideator / critic / merger Env for search |
| Typical train | TDPO, VinePPO, edit-SFT | Same + path/splice preference + optional GAPO |
| Typical test | Fork UI / alternate routes | Entropy-gated ToT/GoT + creative metrics |

Token vines = **instrumentation and training substrate**. This note = **search
+ merge policy** and creative falsifiers. They stack.

## What Classic Transformers Already Give Us

A decoder-only transformer already emits a full next-token distribution and can
batch many prefixes. That is enough to prototype:

| Primitive | Role in this direction |
|-----------|------------------------|
| Softmax over vocab | Local candidates to branch on |
| Top-k / margin / entropy | Branch triggers (EGB/EDEN signals) |
| KV cache | Cheap continuation of each live path |
| Batched forward | Score many prefixes in one pass |
| Shared-prefix / trie KV | Cut memory when beams share history |
| Cross-attention / encoder (optional) | Judge or path-summary stack over siblings |
| Logprobs APIs (HF / vLLM / SGLang / mlx-lm) | Inspect + vines without custom kernels |

Nothing in the classic stack forces single-path greed. Greedy decode is a
**policy**, not an architectural law. The research is a better decode (and
eventually train) policy on the same backbone — then small add-ons if needed.

## Lessons From Newer LLM Work (Deeper)

Borrow mechanisms; do not copy product branding.

### 1. Beam search and trie / shared-prefix decode

Beams recover from locally mediocre tokens when a later sequence scores better.
Cost grows with width; trie / shared KV reduces waste when prefixes overlap.

**Takeaway:** multi-path needs shared compute across siblings, not N full
independent generations.

### 2. Speculative and tree draft decode

Draft models or Medusa heads propose futures; the target verifies in parallel.
Usually for **speed**. The graph (draft tree, tree attention, accept/reject) is
still the right substrate for “try options, keep what survives.”

**Takeaway:** retarget tree drafts for **diversity + quality** only after Phase
1; until then use ordinary batched decode.

### 3. Thought-level search (ToT, MCTS)

Branch on coherent units: sentence, plan step, scene beat, tool call. Search
expands, scores, prunes, backtracks.

**Takeaway:** adaptive **chunk** boundaries matter more than beam-every-token.

### 4. Lookahead / step-level speculation

Reasoning models speculate whole steps, verify semantically, then commit.
Token-level and step-level parallelism can stack.

**Takeaway:** “later you realize this was right” is a live pattern; creativity
should reuse step-level accept/reject, not only token match.

### 5. Multi-token prediction and parallel heads

MTP / Medusa teach short-horizon futures.

**Takeaway:** a multi-future head can propose branch points natively — Phase 2
option, not Phase 0.

### 6. Best-of-N, self-consistency, Self-Refine

BoN/SC select whole answers. Self-Refine revises one line with feedback. Strong
baselines; they rarely **splice** paragraph A with ending B.

**Takeaway:** selection and iterative refine are mandatory controls; recombination
must beat both at equal expand count.

### 7. Graph aggregation and constrained critique

GoT **aggregate** combines advantages of thoughts. Blind peer review improves
creative writing by giving critique **without** exposing peer revisions
(anti-homogenization).

**Takeaway:** merge is not “more debate.” Information-flow constraints matter.

### 8. Multi-agent Env + structured credit

Prime Intellect’s Agent/Env/Episode model programs judge, self-play, user-sim,
proposer–solver. Hierarchical GRPO and RAE fix flat GRPO’s broken comparison
sets across roles.

**Takeaway:** ideator / critic / merger should be Env roles with separate
comparison groups when training — not one soup of traces.

### 9. Diversity-aware group RL

GAPO computes rewards over groups to push coverage of valid outputs, fighting
mode collapse that temperature alone cannot fix.

**Takeaway:** if sibling chunks paraphrase, fix the **objective / filter**, not
only the sampler.

## Proposed Research Stack (Conceptual, Deepened)

Three layers on a classic backbone; optional fourth multi-agent scoring layer.

### A. Branch controller (when to fork)

Actions:

| Action | When | Cost |
|--------|------|------|
| **Commit** | Low entropy, locked plan, budget tight | 1 continuation |
| **Local branch** | Flat top-k at a single critical token | top-k tokens |
| **Chunk branch** | High entropy at chunk boundary / plot turn | B thought samples |
| **Collapse** | Budget hit, scores separated, or depth cap | prune or merge |

Suggested control law (implementable without new weights):

```text
margin = log p(top1) - log p(top2)
H = entropy(next_token | prefix)

if budget_remaining < ε: collapse
elif H > τ_H or margin < τ_m: chunk_branch(B)
elif critical_span(prefix): local_branch(k)
else: commit
```

Tune `τ_H` on held-out creative prompts (EGB lesson: τ is domain-specific;
open-ended text has higher baseline H than GSM8K). Cap total expansions
`E_max` and live width `W_max`. Prefer branching at **chunk starts** (after
newline / sentence end / plan delimiter) so siblings are comparable units for
later splice.

**Heuristic gates are the baseline, not the end state.** Entropy correlates with
ambiguity but not with *marginal value of search*. High entropy on style words
wastes budget; low entropy on a plot-critical name can still be a trap. The
next subsection replaces fixed `τ` with a learned expand policy.

### Learned Expand Controller: Model + RL Architecture

Goal: spend multi-path compute only where it is expected to improve the final
answer enough to justify the cost. Explore further ideas when beneficial;
commit elsewhere.

Related external work (borrow ideas, don’t vendor): input-adaptive allocation
of LM computation (arXiv:2410.04707); constrained test-time budgets
(Solve-then-Learn); adaptive thinking budgets; learned decoding adapters
(arXiv:2603.09065); RL for speculative draft depth (LTD). Brain Spa wiring
stays via [token-level-credit.md](token-level-credit.md) and
[rl-post-training.md](rl-post-training.md).

#### Why a separate controller

| Approach | Problem |
|----------|---------|
| Always branch | Exponential / linear waste on easy spans |
| Fixed entropy threshold | Domain-specific; false positives on noisy open-ended text; misses calm but consequential forks |
| Query-level BoN budget only | Too coarse — hard *tokens/chunks* inside an easy prompt still matter |
| Fine-tune full LM to “think more” | Mixes content policy with compute policy; hard to constrain expands |

Split **what to say** (`π_g`) from **how hard to search** (`π_b`).

#### Modules

```text
┌─────────────────────────────────────────────────────────┐
│  Generator π_g  (classic decoder LM; freeze or slow LoRA)│
│  hidden h_t, next-token dist p(·|s_t)                    │
└───────────────────────────┬─────────────────────────────┘
                            │ features φ(s_t)
                            ▼
┌─────────────────────────────────────────────────────────┐
│  Expand policy π_b  (tiny MLP / LoRA head on h_t)        │
│  action a_t ∈ {commit, local_k, chunk_B, collapse}       │
│  optional: width B_t, depth d_t                          │
└───────────────────────────┬─────────────────────────────┘
                            │
         commit ────────────┤
         expand ────────────┼──► Path memory / trie (B siblings)
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│  Optional Δ-value head V_Δ(s_t, budget)                  │
│  predicts E[quality | expand] − E[quality | commit]      │
└─────────────────────────────────────────────────────────┘
```

| Module | Params | Train? | Role |
|--------|--------|--------|------|
| `π_g` | Full LM | Freeze first; optional slow SFT/LoRA later | Propose tokens / chunks |
| `π_b` | ~0.1–1% via LoRA or 1–2 layer head on `h_t` | **Yes — primary** | Decide expand vs commit |
| `V_Δ` | Same size as `π_b` or shared trunk | Yes (regression) | Marginal gain of one expand |
| Scorer / PRM / harness | External | Freeze or separate | Terminal quality `Q` |

Default Brain Spa lean: Unsloth or MLX LoRA for `π_b` (+ optional `V_Δ`) on a
frozen backbone ([oss-tune-backends.md](oss-tune-backends.md)).

#### Decision points (token vs chunk)

Do **not** call `π_b` on every token if chunking is the grain.

| Mode | When `π_b` runs | Action semantics |
|------|-----------------|------------------|
| **Chunk-gated (default)** | Chunk boundaries only (sentence / plan step / `\n\n`) | `commit` = decode one chunk greedily/sample; `chunk_B` = sample B chunk candidates |
| **Token-gated** | Every step or every k tokens | `local_k` = keep top-k token beams briefly; then collapse |
| **Hybrid** | Chunk by default; token gate if `critical_span` feature fires (numbers, names, tool args) | Mix of above |

Chunk-gated is the efficiency default: fewer decisions, siblings align for
splice, matches ToT/GoT units.

#### State features φ(s_t)

Cheap features first (no extra forward):

| Feature | Source |
|---------|--------|
| Entropy H, top-1/top-2 margin | `p(·\|s_t)` from `π_g` |
| Top-k token ids / probs | logprobs API |
| Budget remaining `E_max − e_used`, live width | controller bookkeeping |
| Boundary flags | punctuation / plan delimiter |
| Position fraction `t/T_max` | decode step |
| Role prior | ideate vs safe (if multi-agent) |

Optional richer features:

| Feature | Source |
|---------|--------|
| `h_t` pooled | last hidden of `π_g` |
| Self-certainty / margin of a quick draft | 1-step lookahead logprob |
| PRM step score on current prefix | process reward model |
| Novelty vs siblings so far | embedding distance |

#### MDP / POMDP

- **State:** `s_t` = prefix (+ φ features; partially observed via `h_t`).
- **Action:** `a_t ∈ A` as above (discrete). Continuous alt: predict expand
  width `B_t ∈ {0…B_max}` with `0 = commit`.
- **Transition:** execute action; append chosen chunk(s); update trie / scores.
- **Terminal reward:**

```text
R = Q(final) − λ · C(expands) + β · DiversityBonus − γ · ConstraintFail
```

Or **constrained** form (preferred for honest budgets):

```text
maximize E[Q]  s.t.  E[C] ≤ B_target
```

Implement via Lagrange multiplier `λ` (binary-search `λ` so mean expands match
budget — Solve-then-Learn pattern) or reject groups that exceed `E_max` in
GRPO filtering.

`Q` = same harness / judge used in Test (RLVR rule). `C` = expand count (or
token×beam FLOPs proxy). DiversityBonus only if siblings clear the novelty
filter (avoid rewarding gibberish).

#### Oracle labels (Solve stage)

Before RL, build a supervised expand dataset:

For sampled prefixes on training prompts:

1. Run **commit** continuation → score `Q_commit` (or K vines mean —
   VinePPO).
2. Run **expand** (width B) + select/aggregate → score `Q_expand`.
3. Label:

```text
y* = 1[ Q_expand − Q_commit > κ · ΔC ]
```

Also store regression target `δ* = Q_expand − Q_commit` for `V_Δ`.

Cap how many prefixes you oracle per prompt (expensive). Prefer uncertain /
boundary prefixes; random subsample the rest. Artifacts → Datasets
(`rows-from-forks` extended with `oracle_expand`).

#### Learn stage — training recipes

Ordered from stable to ambitious. All fit Chipmunk `train-recipe` names.

| Recipe | Signal | When |
|--------|--------|------|
| `expand-sft` / behavior clone | Cross-entropy on `y*` | Cold start `π_b` |
| `expand-delta-reg` | L2/Huber on `V_Δ → δ*` | Calibrate marginal gain |
| `expand-dpo` | Prefer trajectories whose expand masks match high-δ* prefixes | Preference path |
| `expand-grpo` | Group of completions with **different expand masks** / λ; advantage on `Q − λC` | Main on-policy loop |
| `expand-vine-ppo` | VinePPO advantages at prefixes where `π_b` acted; compare expand vs commit vines | Dense credit |
| `hierarchical-grpo` | If critic/merger roles exist — don’t mix with `π_b` traces | Multi-agent stack |

**Recommended default architecture for Brain Spa:**

1. Freeze `π_g`.
2. `expand-sft` on oracle labels until `π_b` beats entropy gate on held-out
   quality@budget.
3. `expand-grpo` with fixed `λ` (or budget reject) using Unsloth/MLX + vLLM or
   mlx-lm rollouts.
4. Add `expand-vine-ppo` only if credit to early expand decisions is too noisy.

Do **not** jointly RL the full generator until the controller Pareto curve is
stable — otherwise `π_g` learns to fish for reward by rambling.

#### Hierarchical budget (optional outer loop)

Two timescales:

```text
π_budget(prompt) → B_total          # contextual bandit / small classifier
π_b(s_t | B_remaining) → a_t        # sequential placer
```

Matches “not all turns/chunks are equally hard”: allocate a thinking budget to
the prompt, then place expands along the decode. Outer loop can imitate oracle
`b*(x;λ)` from constrained allocation papers; inner loop is this section’s
`π_b`.

#### Inference algorithm

```text
e_used ← 0
while not done:
  if at_decision_point(s_t):
    a ← π_b(φ(s_t), E_max - e_used)
    if a == collapse or e_used >= E_max:
      finish with select/aggregate on live paths
    elif a == commit:
      append one chunk from π_g
    elif a == chunk_B:
      sample B diverse chunks; score; keep top W; e_used += B
    elif a == local_k:
      short token beam k; collapse to 1; e_used += k
  else:
    append next token from π_g   # inside a committed chunk
```

Optional: only expand when `V_Δ(s_t) > λ` (threshold = shadow price of compute).

#### Efficiency falsifiers

| Metric | Meaning |
|--------|---------|
| Quality @ fixed `E_max` | Primary — controller must beat entropy gate and uniform expand |
| Expands @ fixed quality | Secondary — same Q with fewer expands |
| Precision of expand | Fraction of expands with oracle `y*=1` |
| Recall of expand | Fraction of beneficial forks that got expands |
| Calibration of `V_Δ` | Correlation with realized `δ*` |
| Waste rate | Expands on paraphrase-only siblings |

If precision is low, raise `λ` / κ or improve features. If recall is low on
planted traps, add trap Evidence and upweight those prefixes in `expand-sft`.

#### Construction map (controller-specific)

| Step | Skill / recipe | Doc |
|------|----------------|-----|
| Collect commit vs expand rollouts | `fork-routes` + forced commit/expand | token-level-credit |
| Write oracle rows | `rows-from-forks` (`oracle_expand`) | datasets-cleaning QC |
| Clone controller | `train-recipe: expand-sft` | oss-tune-backends |
| On-policy | `train-recipe: expand-grpo` / `expand-vine-ppo` | rl-post-training |
| Eval Pareto | `eval-harness` quality vs expands | Test harness metrics |

### B. Path memory (what to keep)

Each live path node:

| Field | Purpose |
|-------|---------|
| `prefix_tokens` / trie node id | Shared KV parent |
| `chunk_span` | Inclusive token range for this thought |
| `role` | `ideate` \| `safe` \| `wild` \| `critic` \| `merge` |
| `score` | logprob, PRM, harness, or judge Trace id |
| `novelty` | distance to siblings (embed / MinHash) |
| `parent_id` / `children` | Tree / DAG for GoT aggregate |
| `budget_spent` | Expansions used under this node |

Storage: keep top-k logprobs and short chunk text in Evidence JSONL (extend
[token-level-credit.md](token-level-credit.md#artifact-shape)); heavy KV stays
in the runtime engine, not git.

### C. Synthesis (how to finish)

Escalating policies — always measure each:

1. **Select** — best full path (BoN / beam / ToT vote).
2. **Lookahead rescore** — grow each survivor one more chunk; then select.
3. **Self-Refine** — critique + revise the selected winner (single-path control).
4. **Recombine (GoT aggregate)** — merge advantages of several chunks into one
   new thought; optionally glue-decode a short bridging span.
5. **Structured splice** — align chunk boundaries; pick best chunk per slot
   under consistency constraints; re-decode glue only.

#### Recombination protocol (detail)

```text
inputs: chunks {(path_i, slot_s, text, score, embedding)}
1. Cluster near-duplicates per slot; keep highest score per cluster
2. Build candidate assemblies by picking one chunk per slot
   (beam over assemblies, not over tokens)
3. Soft constraints:
   - entity / pronoun consistency
   - outline adherence (if plan exists)
   - no duplicated beats
4. Hard reject: contradiction flags from critic / verifier
5. Optional glue: decode ≤ G tokens at each splice boundary conditioned on
   left+right context
6. Final score = harness / judge; compare to best single path
```

**Splice gain** = `score(assembly) − max_i score(path_i)` at equal total expand
count. If median splice gain ≤ 0 across the eval set, recombination is not
earning its complexity.

Failure modes to log:

| Failure | Symptom | Mitigation |
|---------|---------|------------|
| Paraphrase siblings | High cosine / MinHash between paths | Diversity filter; GAPO later |
| Frankenstein prose | Glue fails grammar / tense | Longer glue window; reject |
| Fact clash | Entities disagree across slots | Critic constraint; prefer select |
| Judge sycophancy | Longer splice always wins | Length-normalized scores; blind judge |
| Budget blowup | Expand count ≫ BoN | Hard `E_max`; learned `π_b` / higher λ |

### D. Optional multi-agent scoring layer

```text
Env.run(task, agents={ideator, critic, merger}) -> Episode
```

- Ideator produces B chunks (possibly parallel Agents with different priors).
- Critic grades each chunk **blind** to other revisions.
- Merger only sees graded chunks + scores (or ranked shortlist).
- Episode Trace → Evidence; role-split rows → Datasets; Hierarchical GRPO later.

This is how Prime Intellect patterns help **construct** creative multi-path
systems without turning Chipmunk into a generic chatbot.

## Architectural Options To Study (When, Not Only What)

Ordered least → most invasive. Advance only when the previous tier’s decision
rule says so.

| Tier | Option | Enter when | Exit metric |
|------|--------|------------|-------------|
| 0 | Decode-only ToT/GoT/EGB | Always start here | Baselines logged |
| 1 | Heuristic entropy/margin gate | Phase 1 | Beats fixed width @ `E_max` |
| 2 | **Learned expand controller `π_b` (+ optional `V_Δ`)** | Phase 1c | Beats heuristic on quality@budget |
| 3 | Preference / PRM head (LoRA) | Splice or select needs better ranking | Judge agreement ↑ |
| 4 | Diversity group reward (GAPO-like) | Sibling paraphrase rate high | Distinct-useful ↑ |
| 5 | Medusa/MTP diversity draft tree | Expand cost dominates | Same quality, lower latency |
| 6 | Path-summary encoder / cross-attn over siblings | Prompted GoT aggregate plateaus | Splice gain ↑ at fixed expands |
| 7 | Train-time multi-future objectives | Inference search works but unstable | Recovery ↑ with less Test search |

Path-summary encoder (user’s “different encoder” idea): a thin stack embeds
sibling chunk summaries; the decoder cross-attends when merging. It represents
the **set of open futures**, not a replacement LM. Build only at tier 4.

## Creativity Criteria And Harness Design (Falsifiable)

Do not treat “sounds creative” as success. Every Test run writes metrics next
to the primary control (Brain Spa Test UI rule: one primary Run/Stop, adjacent
stats — see learned preferences).

### Metrics

| Criterion | Measure | Notes |
|-----------|---------|-------|
| Recovery | Fraction of planted early-greed traps fixed by multi-path | Need synthetic traps in Evidence |
| Diversity under quality | # clusters of useful drafts before collapse | Embed + quality gate |
| Distinct-n / self-BLEU | Lexical diversity among siblings | Not sufficient alone |
| Splice gain | `score(assembly) − max score(path)` | **Primary creative falsifier** |
| Budget curve | Quality vs expands / latency / Joules | Log expand count always |
| Controllable branch | Adaptive / learned `π_b` vs fixed width at equal expands | Entropy gate + expand controller value |
| Expand precision / recall | Beneficial forks expanded; waste expands avoided | From oracle `y*` or planted traps |
| Homogenization | Drop in diversity when critics see peer drafts | Blind vs open critique A/B |
| Judge robustness | Agreement under length-normalization / swap tests | Avoid length bias |

Baselines on the same prompt set: greedy · nucleus · BoN · ToT-select ·
GoT-aggregate · Self-Refine · Phase-1 stack · Phase-1b multi-agent.

### Minimal creative Test harness sketch

Not shipping code here — contract only:

| Field | Purpose |
|-------|---------|
| Prompt set | Creative writing + constrained planning with known early forks |
| Planted traps | Prefixes where top-1 token leads to dead end |
| Scorer | Composite: constraint pass + human/LLM rubric + length penalty |
| Same scorer in Tune | RLVR rule — shared module |
| Artifacts | Branch tree, expand count, splice decision, scores under `~/.brain-spa` |

Follow [environment-harness-spec.md](environment-harness-spec.md) and
[harness-and-test-ui-guide.md](harness-and-test-ui-guide.md): sparse UI, no lab
chrome, no committed screenshots.

### Extended artifact shape (chunk + splice)

Extend the token fork JSONL from
[token-level-credit.md](token-level-credit.md#artifact-shape):

```json
{
  "prefix_id": "...",
  "grain": "chunk",
  "index": 17,
  "entropy": 2.4,
  "margin": 0.15,
  "action": "chunk_branch",
  "controller": {"policy": "pi_b|entropy_gate", "v_delta": 0.12, "budget_left": 8},
  "oracle_expand": {"y_star": 1, "delta_q": 0.18, "delta_c": 3},
  "candidates": [
    {"id": "c1", "role": "ideate", "text": "...", "score": 0.62, "novelty": 0.8},
    {"id": "c2", "role": "wild", "text": "...", "score": 0.41, "novelty": 0.9}
  ],
  "finish": {
    "policy": "aggregate",
    "assembly": ["c1", "other_path.slot2"],
    "splice_gain": 0.07,
    "expand_count": 12
  },
  "episode_id": null
}
```

Never commit these dumps; keep under `~/.brain-spa`.

## Datasets Hygiene For Multi-Path

Sibling branches that are paraphrases waste expand budget and teach collapse.

Borrow [datasets-cleaning.md](datasets-cleaning.md) stages on fork/splice
corpora:

1. Heuristic quality on each chunk.
2. Exact dedup on normalized chunk text.
3. Fuzzy / semantic dedup **within** a prompt’s candidate set (aggressive) and
   lighter across the corpus.
4. Preference scrub: drop ties; re-judge “chosen” path; length filters.
5. QC report with `dropped.near_paraphrase_siblings` counts.

Rejection sampling: generate N assemblies, keep verifier-/harness-passers only
(`reject-sample` skill).

## Fit In Brain Spa (Later, Not Now)

Reuse the training-methods loop map:

| Loop stage | Possible artifact | Borrow construction from |
|------------|-------------------|--------------------------|
| Evidence | Recovery cases; chunk fork dumps; judge Traces | token-level-credit · agentic-judge |
| Datasets | Path pairs; splice accept/reject; vine rows; role-split Episode rows; cleaned shards | datasets-cleaning · `rows-from-forks` · `rows-from-episode` |
| Tune | Unsloth/MLX LoRA; `expand-sft` / `expand-grpo` / `token-dpo` / `vine-ppo` / `hierarchical-grpo` | oss-tune-backends · rl-post-training · expand controller |
| Test | Creative harness; multi-agent Env optional; shared RLVR scorers | catalog eval · multi-agent section |

Chipmunk / resident workers stay loop operators. Multi-path is a **generation
policy** under Test (and later Tune), not a fifth pillar. Automation extends
existing skills plus `env-multi-agent` / `agentic-judge`.

Public shell: no persona demo; no committed weights, rollouts, or screenshots.

## Open Questions

1. Right branch unit: token vs sentence vs learned chunk? (Start with ToT thoughts.)
2. Does GoT aggregate beat ToT/BoN/Self-Refine on creative metrics at equal expands?
3. Does entropy gating transfer from math to high-entropy creative text?
4. Can learned `π_b` beat a well-tuned entropy/margin gate on quality@budget?
5. Is `V_Δ` worth a separate head, or is discrete `π_b` enough?
6. Blind critic vs open debate: which preserves diversity without killing quality?
7. Path-summary encoder vs better prompted merge vs small preference head?
8. How to stop paraphrase mode collapse (filters vs GAPO vs role priors)?
9. How much creativity is Test-time search vs training that rewards recovery?
10. Practical KV trie limits for live width 2–5 on local Unsloth/MLX boxes?
11. When does Hierarchical GRPO beat flat GRPO for ideator/merger roles?
12. Should `π_g` stay frozen forever, or jointly adapt after `π_b` stabilizes?

## Non-Goals For This Note

- No new API routes, UI, or training code in this PR.
- No claim that branching alone equals creativity.
- No claim of a wholly new paradigm: ToT/GoT/EGB/Medusa/verifiers already cover
  large parts; the bet is a measured composition aimed at creative splice-gain.
- No duplicate training handbook — construction lives in
  [training-methods.md](training-methods.md) and deep dives.
- No vendoring prime-rl / NeMo as required shell deps.
- No commitment to one paper recipe in production.

## Suggested First Experiment (When Implementation Starts)

Align with **Phase 0 → Phase 1 → Phase 1c** (1b optional) and
[training-methods.md](training-methods.md):

1. Prompt set with early-greed traps (creative writing + constrained plan).
2. Baselines: greedy · nucleus · BoN · ToT-select · GoT-aggregate · Self-Refine ·
   entropy-gated expand.
3. Treatment A: entropy-gated chunk branch + select **and** aggregate under fixed
   `E_max`; diversity filter on siblings.
4. Treatment B (Phase 1c): freeze `π_g`; train `π_b` via oracle commit-vs-expand
   labels (`expand-sft`) then `expand-grpo` with `R = Q − λC`; compare Pareto to
   entropy gate.
5. Optional 1b: frozen critic Agent scores chunks blind; merger aggregates.
6. Emit extended fork/splice JSONL including `action`, `oracle_expand`,
   `expand_count`; log splice gain and diversity under `~/.brain-spa`.
7. Decision rule → only then splice LoRA / Hierarchical GRPO / path encoder.

That answers: can we keep multiple **chunk** options open only where it helps,
stitch or select later, and **learn** the expand policy with the stacked OSS
training catalog — instead of paying exponential compute everywhere?
