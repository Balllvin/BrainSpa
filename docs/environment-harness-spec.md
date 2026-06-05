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