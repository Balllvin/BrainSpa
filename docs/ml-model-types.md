# ML model types in Brain Spa

Brain Spa is not only an LLM fine-tuning app. The same loop shape applies to **any trainable model**.

## `causal_lm`

- Examples: Believer (`persona_small`), coding worker experiments
- Evidence → Datasets (SFT JSONL) → Tune (LoRA adapter) → Test (chat/generate scenarios)
- Artifacts: `dataset_sft_train.jsonl`, `believer_adapter/`

## `policy`

- Examples: Snake Policy (`snake_policy`)
- Evidence: **skipped** — rollouts come from the environment
- Datasets: `trajectories.jsonl`, `transitions.jsonl` under `artifacts/datasets/snake_rollout/`
- Tune: DQN checkpoint `policy.pt` under `artifacts/training/snake_rl_validation/`
- Test: `interactive_*` scenarios (train, watch, play, coach, arena)

When adding a new policy model, register `model_kind: policy` in state, add scenarios in `test_scenarios.py`, and implement a trainer in `packages/brainspa_training/`.