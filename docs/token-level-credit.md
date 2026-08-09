# Token-Level Credit And Alternate Routes

RL and inspection when **one token** (or one prefix) is the decision point:
see why it was chosen, mark a better token, fork other routes, train on that.

Index: [training-methods.md](training-methods.md). Companion:
[rl-post-training.md](rl-post-training.md).

## Idea

Autoregressive generation is an MDP:

- **State** `s_t` = prompt + tokens so far (the prefix)
- **Action** `a_t` = next token
- **Reset** = re-feed the prefix (always possible; no env simulator needed)

You can score full answers (outcome) *or* estimate how good a prefix is by
sampling several continuations (“vines”). You can also intervene: replace `a_t`
with `a'_t` and see what routes appear.

## Operator loop

1. Generate (or replay) a trajectory; keep **top-k logprobs** per step.
2. **Inspect** token `t`: chosen string, prob, rank, alternatives.
3. **Correct** (optional): human, verifier, or judge picks a better token.
4. **Fork:** sample K continuations from `(s_t, a_t)` and from `(s_t, a'_t)`
   (and optionally other top-k alts).
5. **Score** each branch (pass/fail, harness metric, PRM step score).
6. Write an Evidence / Dataset artifact.
7. **Train:** TDPO / token preference, VinePPO-style advantages, edit-SFT, or
   group RL on vines.

```text
s_t = prefix
a_t  = factual token
a'_t = corrected token

forks(a_t):  R1..Rk   → scores
forks(a'_t): R'1..R'k → scores

advantage ≈ mean(score | a'_t) − mean(score | a_t)
# or VinePPO: V̂(s_t) = mean reward of K vines from s_t
```

## VinePPO — MC credit without a critic

Paper: https://arxiv.org/abs/2410.01679  
Code: https://github.com/McGill-NLP/VinePPO

**Problem:** PPO’s value net is often a poor credit assigner on long reasoning;
group methods (GRPO/RLOO) share one baseline across all tokens in a completion.

**Method:** For each prefix `s_t` on a training trajectory, sample K auxiliary
continuations from the current policy, average their **outcome** returns →
`V̂_MC(s_t)`. Advantages use those MC values (GAE-style or one-step). Aux vines
are for value only; they are not policy gradient samples.

**Why it works in LM land:** resetting to `s_t` is free (just decode from that
context). Modern engines (vLLM/SGLang) make the extra rollouts practical.

**Cost:** roughly (states you vine) × K extra generations. Start with vines at
step boundaries or uncertain tokens (low margin in top-k), not every token.

**Brain Spa UI rhyme:** alternate Snake boards from one state ↔ alternate text
routes from one prefix.

## Token preference (TDPO and friends)

Sequence DPO treats the whole answer as one action. **Token-level DPO (TDPO)**
pushes probability at specific positions — closer to “this token should have
been X.”

https://github.com/vance0124/Token-level-Direct-Preference-Optimization

Use when Evidence is a correction at index `t`, not a full alternate essay.
Still store full strings for audit; loss can focus on the edit span.

Related dense signals: on-policy distillation / MOPD in NeMo RL (teacher token
advantages on student rollouts) — [oss-tune-backends.md](oss-tune-backends.md#nvidia).

## Process rewards (PRM)

Outcome rewards are sparse. **Process reward models** score intermediate steps.

| Resource | What | Link |
|----------|------|------|
| PRM800K | ~800k human step labels on MATH solutions (“Let’s Verify Step by Step”) | https://github.com/openai/prm800k · https://arxiv.org/abs/2305.20050 |
| Math-Shepherd | Automatic step labels + PRM; verify and step-PPO without human step tags | https://arxiv.org/abs/2312.08935 |
| TP-GRPO | Generative PRM-style thinking for denser RL | https://github.com/cs-holder/tp_grpo |

**Auto step labels (Math-Shepherd idea):** from a partial solution, roll out to
the end many times; step quality ≈ how often the final answer is correct. Same
reset property as VinePPO.

**Pitfalls:** noisy auto labels; PRM trained on GPT-4 traces may not transfer to
your local model’s distribution; reward hacking on “looks like a good step.”

## Trees and counterfactual decode

| Tool | Role | Link |
|------|------|------|
| Tree of Thoughts | Explicit branch exploration at decode time | https://github.com/princeton-nlp/tree-of-thought-llm |
| TreePO | Tree-structured policy optimization | https://github.com/multimodal-art-projection/TreePO |
| MCTS-guided decode | Search with discriminators / PRMs | PPL-MCTS and survey literature |
| Counterfactual token SCMs | Formal “if token i changed under fixed noise…” | https://arxiv.org/abs/2409.17027 |

Credit assignment survey and related families (CCPO / hindsight): see also
Prime Intellect **Hierarchical GRPO** and **RAE** for multi-agent roles —
[rl-post-training.md](rl-post-training.md#multi-agent-rl-prime-intellect).

For Brain Spa Test, start simpler: top-k + forced-token fork + K random vines.
Add MCTS only if operators need deep search UIs.

Creative multi-path decode adds a **learned expand policy** (when to spend
vines / chunk branches under budget) —
[plan P4](plan-multi-path-creative-model.md) ·
[research](research-multi-path-creative-decoding.md#learned-expand-controller-summary)
and `expand-grpo` in [rl-post-training.md](rl-post-training.md).

## Artifact shape

One JSONL record per fork point (Evidence / Datasets):

```json
{
  "prefix_id": "...",
  "index": 17,
  "chosen": {"token": "therefore", "prob": 0.41, "rank": 1},
  "alternatives": [
    {"token": "however", "prob": 0.22, "rank": 2},
    {"token": "because", "prob": 0.09, "rank": 3}
  ],
  "correction": {"token": "however", "source": "human|verifier|judge"},
  "branches": [
    {"from": "chosen", "continuation_id": "c1", "score": 0.0, "fail": "wrong final"},
    {"from": "correction", "continuation_id": "c2", "score": 1.0, "fail": null}
  ]
}
```

**Storage budget:** keep top-k (e.g. 5–20), not full logits. Cap vines per
inspect action. Continuations live as artifacts under `~/.brain-spa`, not git.

## Tune recipes

| Recipe | Signal |
|--------|--------|
| `token-dpo` / TDPO | chosen vs corrected (or best vs worst vine) at `t` |
| `vine-ppo` | MC advantages from prefix forks |
| `token-grpo` | Group of continuations from same prefix |
| `edit-sft` | Force corrected token, teacher-force onward |
| `reject-at-token` | Keep only vines that pass after the edit |

Chipmunk: `inspect-token` → `fork-routes` → `rows-from-forks` → `train-recipe`.

## Logprobs sources

- **mlx-lm** batch/generate APIs on Apple Silicon (see [oss-tune-backends.md](oss-tune-backends.md#mlx))
- HF `generate(..., output_scores=True, return_dict_in_generate=True)`
- vLLM / SGLang logprob APIs (preferred for CUDA volume)
- See [oss-tune-backends.md](oss-tune-backends.md#inference-and-rollout-workers)

## Pitfalls

- Fork explosion (every token × K) — vine selectively
- Judge bias when “correction” isn’t verifier-backed
- Treating PRM scores as ground truth
- Comparing vines with different lengths without length-aware scoring
- Leaking full prompts with secrets into Evidence dumps

## Related

- [rl-post-training.md](rl-post-training.md)
- [oss-tune-backends.md](oss-tune-backends.md)
- [loop-pipeline-and-feedback.md](loop-pipeline-and-feedback.md)
- [environment-harness-spec.md](environment-harness-spec.md)
- [research-multi-path-creative-decoding.md](research-multi-path-creative-decoding.md) — chunk-level multi-path + splice research; uses this doc’s vines/recipes to construct models
