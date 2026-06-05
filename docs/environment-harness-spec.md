# Environment harness specification

Every Brain Spa test environment must define:

| Field | Purpose |
|-------|---------|
| `world_state` | Serializable facts the model or evaluator sees |
| `allowed_actions` | Legal action set per step |
| `reward_components` | Named scalars logged every step (not one bit) |
| `failure_comments` | Machine-readable outcome labels |
| `scenario.mode` | UI archetype: `chat`, `generate`, or `interactive_*` |
| `dataset_export` | How episodes append to Datasets artifacts |
| `tune_backend` | `causal_lm` (LoRA) or `policy` (e.g. DQN) |

## Reference: Snake 10×10

- Package: `packages/brainspa_environments/snake/`
- API: `/api/env/snake/*`, `/api/policy/*`
- Acceptance: 100-episode eval; north star = 10 consecutive full-board wins

See [ml-model-types.md](./ml-model-types.md) and [custom-harnesses.md](./custom-harnesses.md).

## Snake scenario matrix

| Scenario | Mode | Training profile |
|----------|------|------------------|
| autonomous-train | `interactive_train` | solo, wrapped_v2, arena (DQN or SB3) |
| autonomous-watch | `interactive_watch` | eval playback |
| human-play | `interactive_play` | archives session for coach |
| coach-replay | `interactive_coach` | compares steps to checkpoint |
| human-vs-ai | `interactive_arena` | human vs policy |
| dual-arena | `interactive_arena` | self-play same weights |

Optional SB3: `pip install stable-baselines3 gymnasium` then choose **Stable-Baselines3** in Autonomous train.