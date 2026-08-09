# Research: Multi-Path Creative Decoding

Status: **research reference only**. Execution phases, Path Env modes, and
borrow→warp checklists live in
[plan-multi-path-creative-model.md](plan-multi-path-creative-model.md).

OSS construction catalog: [training-methods.md](training-methods.md).

## Research bet

Classic autoregressive decode commits locally (argmax / sample / small beam).
That is weak when an early choice looks fine and a later consequence shows it
was wrong — and weak for creativity that needs **several coherent futures**,
not only higher temperature.

**Bet:** at selected tokens or **chunks**, keep multiple continuations alive;
later **select or recombine** the best parts; spend multi-path compute only
where a controller (heuristic, then learned) expects enough gain to justify
cost.

```text
prefix / locked start S
  ├─ path A ── chunk ── … ── candidate A
  ├─ path B ── …            ── candidate B
  └─ path C ── …            ── candidate C
                 │
                 ▼
         select / splice
                 │
                 ▼
            final answer
```

Creativity here = structured exploration + late judgment, not vibes.

## Has this been done before?

**Mostly in pieces.** Inventing multi-path, chunking, or multi-agent judges
from zero would duplicate mature work. The open gap is a **measured composition**
aimed at creative splice-gain and **cost-aware expand placement**, proven with
harness artifacts — which is what the [plan](plan-multi-path-creative-model.md)
operationalizes for Brain Spa.

### Prior-art map

| Idea | Studied as | Status |
|------|------------|--------|
| Several futures vs greedy | Beam; Best-of-N; Self-Consistency | Mature |
| Branch on chunks / thoughts | Tree of Thoughts (ToT) | Mature, OSS |
| Explore / score / backtrack | ToT BFS/DFS; MCTS; MCT Self-Refine | Mature-ish |
| When to branch | EGB; EDEN; Adaptive Beam Search | Recent OSS |
| Pull best parts together | Graph of Thoughts **aggregate**; Self-Refine | GoT closest to splice |
| Tree drafts / MTP | Medusa, EAGLE, speculative decode | Mature for **speed** |
| Role-split ideate / judge | Prime Intellect Agent/Env; AgenticJudge; blind peer review | Emerging |
| Learn where extra compute helps | Adaptive BoN/routing; thinking budgets; learned decoding adapters; RL draft depth | Emerging |
| Diversity of valid futures | GAPO; rejection sampling | Emerging |
| Reasoning distill | Open-R1; OpenThoughts; on-policy distill / MOPD | Mature-ish |
| Creative writing search | ToT creative task; LLM Review | Often select/revise, not cross-path splice |

### Underexplored (research gaps)

1. Recombination vs selection on **creative** metrics at equal expand count.
2. Entropy gate + chunk grain + aggregate in one stack (math-oriented EGB ≠ creative text).
3. Diversity-first draft trees (Medusa trees optimize acceptance, not divergence).
4. Role-conditioned multi-path with Hierarchical GRPO/RAE on **path** Episodes.
5. Learned expand policy that beats entropy on quality@budget for open-ended tasks.
6. Locked-start **multi-teacher** traces + human reasoning edits as one corpus family.
7. Falsifiable creative harnesses (recovery, splice-gain, $/quality) — Brain Spa Test fit.

Live question for the plan’s P4/P5:

> Can entropy-gated then **learned** chunk expand + GoT-style aggregate, fed by
> Path Env teacher/edit corpora, beat Best-of-N / ToT-select at the same compute?

## Open-source building blocks (reference)

Prefer standing on these; the plan names how Brain Spa warps them.

### Search / merge

| Project | Gives you | Link |
|---------|-----------|------|
| Tree of Thoughts | Chunk branch, value/vote, creative-writing task | https://github.com/princeton-nlp/tree-of-thought-llm |
| Graph of Thoughts | Aggregate across thoughts | https://github.com/spcl/graph-of-thoughts |
| Self-Refine | Feedback → revise (single-path control) | https://github.com/madaan/self-refine |
| MCTSr / mcts-llm | MCTS + critique/refine | https://github.com/BrendanGraham14/mcts-llm |

### Adaptive expand

| Project | Gives you | Link |
|---------|-----------|------|
| Entropy-Gated Branching | Branch only at high entropy; PRM prune | https://github.com/JXL884/entropy_gated_branching |
| Adaptive Beam Search | Entropy-guided beam | https://github.com/yoongja/ABS |
| EDEN | Branch factor monotone in entropy | arXiv:2605.09745 |
| Adaptive compute allocation | Predict where extra decode helps | arXiv:2410.04707 |
| Learned decoding adapters | RL policy over decode knobs | arXiv:2603.09065 |
| Learning to Draft (LTD) | RL for speculative depth/width | arXiv:2603.01639 |

### Multi-agent / credit / distill

| Project | Gives you | Doc / link |
|---------|-----------|------------|
| verifiers + prime-rl | Agent/Env/Episode; judge; Hierarchical GRPO/RAE | [rl-post-training.md](rl-post-training.md#multi-agent-rl-prime-intellect) |
| VinePPO, TDPO, PRM800K | Prefix vines; token preference; process rewards | [token-level-credit.md](token-level-credit.md) |
| Open-R1 / OpenThoughts | Distilled reasoning corpora | [rl-post-training.md](rl-post-training.md) |
| GAPO | Group rewards for diversity | EMNLP 2025 |
| LLM Review | Blind peer critique (anti-homogenization) | arXiv HTML 2601.08003 |

### Speed substrate (optional later)

Medusa, EAGLE, MTP catalogs — use only after quality policy works
([plan P4+](plan-multi-path-creative-model.md)).

## Architecture rationale (research → plan)

These are **design findings**, not phase checklists. Implementation order is
in the plan (P0–P6).

### 1. Split generator from expand policy

| Module | Role |
|--------|------|
| `π_g` | Classic decoder — *what to say* |
| `π_b` | Tiny LoRA/head — *commit vs expand* under budget |
| `V_Δ` | Optional: predicted quality gain of one expand |

Entropy/margin gates are strong **features and baselines**; they are not the
end state. High entropy ≠ high marginal value of search (style tokens vs
plot-critical calm forks).

**Plan warp:** P4 heuristic gate → oracle labels → `expand-sft` → `expand-grpo`;
freeze `π_g` while training `π_b`
([plan P4–P5](plan-multi-path-creative-model.md)).

### 2. Chunk grain default

ToT/GoT show coherent thought units beat token-every-step for planning and
creative writing. Token-level forks remain for **inspect/edit credit**
(VinePPO/TDPO).

**Plan warp:** Path Env `expand`/`splice` at chunk boundaries; `fork` mode for
token vines ([plan Unified Path Env](plan-multi-path-creative-model.md#unified-path-env-one-harness-family-several-modes)).

### 3. Select vs recombine

BoN/ToT-select and Self-Refine are mandatory controls. GoT **aggregate** and
structured splice are the distinctive creative claim.

**Splice gain** = `score(assembly) − max score(path)` at equal expands. If
median ≤ 0, research says ship select-only — the plan records that honestly.

Recombination failure modes (paraphrase siblings, Frankenstein prose, fact
clash, length-biased judges) should be logged as Evidence, not hidden.

### 4. One Path Env, many modes (combined RL story)

Research threads (correct-reasoning, teacher fanout, vines, multi-agent judge,
expand MDP) share one MDP shape: **prefix → actions → scored continuations**.
Keeping them as separate “RL envs” duplicates harness surface area.

**Plan warp:** Unified Path Env modes `draft|fanout|edit|fork|expand|score|splice`
with one artifact schema
([plan](plan-multi-path-creative-model.md#unified-path-env-one-harness-family-several-modes)).

### 5. Offline path corpora feed online expand

Multi-teacher disagreement at a locked start `S` is a natural label that
`π_b` should expand. Human/agent reasoning edits teach recovery, not only
final-answer match.

**Plan warp:** P1 seed distill → P3 fanout/edit corpora → P4 oracle + P5
`distill-paths` / `edit-sft` / `path-dpo`.

### 6. Constrained compute objective

Prefer maximize `E[Q]` s.t. `E[C] ≤ B` (or `Q − λC`) over unbounded search.
Solve-then-Learn (oracle labels then clone) then on-policy GRPO is more stable
than jumping straight to joint RL of full LM + controller.

## Heuristic control law (baseline for experiments)

```text
margin = log p(top1) - log p(top2)
H = entropy(next_token | prefix)

if budget_remaining < ε: collapse
elif H > τ_H or margin < τ_m: chunk_branch(B)
elif critical_span(prefix): local_branch(k)
else: commit
```

Tune `τ` on held-out **creative** prompts (open-ended entropy baselines differ
from GSM8K). Cap `E_max`, `W_max`. Prefer decisions at chunk starts.

Learned `π_b` must beat this on quality@budget
([plan P4 exit](plan-multi-path-creative-model.md)).

## Learned expand controller (summary)

Full training recipes and inference loop: historically detailed in earlier
revisions; **normative build steps are now in the plan**. Research summary:

- **State features:** H, margin, top-k, budget left, boundary flags, optional
  `h_t`, PRM score, novelty vs siblings.
- **Actions:** `commit | local_k | chunk_B | collapse` (or continuous width).
- **Oracle:** force commit vs expand; `y* = 1[ΔQ > κ·ΔC]`; also regress `δ*` for
  `V_Δ`.
- **Train:** `expand-sft` → `expand-grpo` → optional `expand-vine-ppo`.
- **Falsifiers:** quality@`E_max`, expands@quality, expand precision/recall,
  `V_Δ` calibration, waste rate on paraphrase siblings.

Deep dive for implementers: see plan P4 and
[rl-post-training.md](rl-post-training.md) (`expand-*` recipes) +
[token-level-credit.md](token-level-credit.md).

## Reasoning traces and multi-teacher distill (summary)

Two data engines, one schema:

| Engine | Idea |
|--------|------|
| Correct-the-reasoning | Draft → human/agent **edits reasoning** → edit-SFT / DPO / vines |
| Multi-teacher fanout | Lock start `S` → 2–4 OSS teachers with different priors → distill passers + path prefs |

**Plan warp:** both are Path Env modes (`edit`, `fanout`), not separate
products ([plan P3/P5](plan-multi-path-creative-model.md)).

Pitfalls (research): single-teacher homogenization; editing finals not
reasoning; unverified agent edits; training on failures without reject/pref;
API leakage — prefer local teachers.

## Creativity / efficiency metrics (falsifiers)

| Metric | Meaning |
|--------|---------|
| Recovery | Planted early-greed traps fixed |
| Diversity under quality | Useful clusters before collapse |
| Splice gain | Assembly vs best single path |
| Quality @ fixed expands | Primary efficiency+quality |
| Expand precision/recall | Beneficial forks hit; waste avoided |
| Homogenization A/B | Blind vs open critique |
| Edit delta | Corrected reasoning vs draft on harness |

Baselines: greedy · nucleus · BoN · ToT-select · GoT-aggregate · Self-Refine ·
entropy gate · learned `π_b`.

## How Brain Spa should use this research

| Research finding | Do this in the plan |
|------------------|---------------------|
| Pieces already exist | Don’t rewrite ToT/GoT/verifiers; compose and measure |
| Entropy ≠ value of search | P4: heuristic baseline then learned `π_b` |
| Chunk > token for creativity | Path Env chunk-gated expand; token fork for credit |
| Splice may lose | Report splice gain; allow select-only ship |
| Multi-agent is structure | One Path Env with roles — not poker demos |
| Distill needs diversity | 2–4 teachers + dedup; Open-R1 as seed only |
| Freeze generator for controller | P5 expand recipes before joint RL |
| Shared scorers | RLVR: same Path Env scorer in Test and Tune |

Manipulation rules (borrow → ours):
[plan § Manipulation guide](plan-multi-path-creative-model.md#manipulation-guide-borrow--make-it-ours).

## Open questions

1. Chunk vs token vs learned boundary — does creative text need adaptive units?
2. Does aggregate beat select / Self-Refine at equal expands on our harness?
3. Does `π_b` beat a well-tuned entropy gate on quality@budget?
4. Is `V_Δ` worth separate params?
5. Blind critic vs open debate for diversity?
6. Multi-teacher path corpora vs single-teacher Open-R1 distill on recovery?
7. Reasoning edits vs more teacher fanout — leverage per hour?
8. How many continuation priors (2 vs 4) before dedup saturates?
9. When to jointly train `π_g` with `π_b`?
10. Practical KV/trie limits on Unsloth/MLX boxes at width 2–5?

## Non-goals (research doc)

- Phase schedules and Chipmunk skill lists → **plan**
- Backend install matrices → **oss-tune-backends / training-methods**
- Claiming branching alone equals creativity
- Vendoring megatrain or prime-rl into the public shell

## Related

- [plan-multi-path-creative-model.md](plan-multi-path-creative-model.md) — **build plan**
- [training-methods.md](training-methods.md) · [rl-post-training.md](rl-post-training.md)
- [token-level-credit.md](token-level-credit.md) · [datasets-cleaning.md](datasets-cleaning.md)
- [ml-model-types.md](ml-model-types.md) · [environment-harness-spec.md](environment-harness-spec.md)
