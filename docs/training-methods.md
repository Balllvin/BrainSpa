# Training Methods

Open-source methods Brain Spa can borrow to widen Evidence → Datasets → Tune → Test.

**Rule:** borrow patterns and small algorithms. Keep artifacts local and inspectable. Do not vendor megatrain stacks into the public shell.

Studio lineage (CleanRL, Gymnasium, Spinning Up): [ml-platform.md](ml-platform.md).

## Loop Map

| Stage | What to borrow | Deep dive |
|-------|----------------|-----------|
| Evidence | Failures, judges, token forks + logits | [token-level-credit.md](token-level-credit.md) |
| Datasets | Cleaning, SFT/preference rows, vine rollouts | [datasets-cleaning.md](datasets-cleaning.md) · [training-method-catalog.md](training-method-catalog.md) |
| Tune | SFT, preference, GRPO/GSPO, multi-agent, VinePPO, classic RL | [oss-tune-backends.md](oss-tune-backends.md) · [rl-post-training.md](rl-post-training.md) |
| Test | Gym / agentic / multi-agent envs, eval, route forks | [training-method-catalog.md](training-method-catalog.md#agentic-environments) · [rl-post-training.md](rl-post-training.md#multi-agent-rl-prime-intellect) · [token-level-credit.md](token-level-credit.md) |

## Priority Order

1. [Unsloth](oss-tune-backends.md#unsloth) — local SFT / QLoRA / GRPO / GSPO / DPO (NVIDIA GPU)
2. [MLX](oss-tune-backends.md#mlx) — Apple Silicon inference + LoRA / GRPO Tune and Test
3. [Token-level credit](token-level-credit.md) — inspect token, mark correction, fork routes, RL
4. [OpenEnv / NeMo Gym / verifiers](training-method-catalog.md#agentic-environments) — harness + multi-agent Env contracts
5. [Data cleaning](datasets-cleaning.md) — dedup, filters, QC before Tune
6. [CleanRL / Studio](ml-platform.md) — compact env + algorithm registry
7. [TRL + GRPO / RLVR / multi-agent](rl-post-training.md) — reasoning, verifiers, Prime Intellect patterns
8. [Preference methods](training-method-catalog.md#preference-and-alignment) — DPO / ORPO / KTO / SPIN
9. [Eval harnesses](training-method-catalog.md#evaluation) — lm-eval, Inspect, LightEval
10. [NVIDIA refs](oss-tune-backends.md#nvidia) — NeMo RL / Gym / Curator (study, don’t ship)
11. [Pretrain / CPT](training-method-catalog.md#pretraining) — nanoGPT / LitGPT honesty path

## Doc Map

| Doc | Contents |
|-----|----------|
| [oss-tune-backends.md](oss-tune-backends.md) | Unsloth, MLX, NVIDIA, vLLM / SGLang / export |
| [rl-post-training.md](rl-post-training.md) | GRPO, GSPO, RLVR, Open-R1, **multi-agent (Prime Intellect)** |
| [token-level-credit.md](token-level-credit.md) | Why-token, corrections, vines, TDPO, PRMs |
| [datasets-cleaning.md](datasets-cleaning.md) | Dedup, filters, synthetic data, QC artifacts |
| [training-method-catalog.md](training-method-catalog.md) | Method + repo tables (pretrain through eval) |
| [research-multi-path-creative-decoding.md](research-multi-path-creative-decoding.md) | Research: prior art, architecture rationale, open questions |
| [plan-multi-path-creative-model.md](plan-multi-path-creative-model.md) | **Build plan:** unified Path Env, P0–P6 phases, borrow→warp |
| [plan-path-rl-architecture.md](plan-path-rl-architecture.md) | **RL architecture:** modules, MDPs, graphs, losses, per-repo take/change/wire/don’t |

## Automation Sketch

| Skill | Worker | Job |
|-------|--------|-----|
| `ingest-failure` | Source | Test miss → Evidence |
| `inspect-token` | Source / Harness | Top-k logits at index `t` |
| `fork-routes` | Harness | Vines for chosen vs corrected |
| `clean-dataset` | Data | Filtered shard + QC report |
| `rows-from-evidence` | Data | SFT / preference / transition rows |
| `rows-from-forks` | Data | Token-edit / vine rows |
| `reject-sample` | Data | Keep verifier-passers |
| `dry-run-train` | Training | Deps, VRAM, template check |
| `env-multi-agent` | Harness | Judge / self-play / user-sim episode |
| `fanout-teachers` | Harness / Data | 2–4 OSS continuations from a locked start |
| `edit-reasoning` | Source / Harness | Human or agent correction of a reasoning trace |
| `rows-from-traces` | Data | Multi-path SFT / preference rows from teachers + edits |
| `train-recipe` | Training | `unsloth-*`, `mlx-*`, `expand-grpo`, `distill-paths`, `edit-sft`, `hierarchical-grpo`, `token-dpo`, `vine-ppo`, … |
| `eval-harness` | Harness | Post-train report → Evidence on fail |
| `close-the-loop` | Chipmunk | Chain the above |

Skills call `/api/*` and write under `~/.brain-spa`. Recipe shape can mirror Unsloth / MLX-LM / TRL / Axolotl flags.

## Boundaries

See [public-shell-boundary.md](public-shell-boundary.md) and [loop-pipeline-and-feedback.md](loop-pipeline-and-feedback.md). Do not commit weights, rollouts, or screenshots. Do not center the product on one adapter or demo harness.

## Related

- [ml-platform.md](ml-platform.md)
- [loop-pipeline-and-feedback.md](loop-pipeline-and-feedback.md)
- [environment-harness-spec.md](environment-harness-spec.md)
- [custom-harnesses.md](custom-harnesses.md)
- [ml-model-types.md](ml-model-types.md)
- [research-multi-path-creative-decoding.md](research-multi-path-creative-decoding.md) — research reference (prior art / rationale)
- [plan-multi-path-creative-model.md](plan-multi-path-creative-model.md) — Brain Spa phased plan (Path Env, pretrain→expand→distill)
- [plan-path-rl-architecture.md](plan-path-rl-architecture.md) — precise RL/training architecture + repo manipulation
