# Model Types

Brain Spa supports two model families.

## Language Models

Language-model work uses evidence-backed text rows, preference pairs, dry-runs, adapters, and chat/generate test environments.

The public shell does not seed a language model. Add one only when the target behavior, evidence source, dataset route, tune route, and test harness are all explicit.

## Policy Models

Policy work uses environment rollouts and action/reward transitions instead of prompt/answer rows.

Current shipped example:

- model key: `snake_policy`
- dataset key: `snake_rollout`
- project key: `snake_rl_validation`
- environment: `snake_10x10`
- checkpoint: `~/.brain-spa/artifacts/training/snake_rl_validation/policy.pt`

The checkpoint path is local runtime state. It must not be committed.

## Generic ML Core

Beyond the seeded Snake policy, the **Studio** (`packages/brainspa_ml/`, API `/api/ml/*`, UI Tune → Studio) trains models from scratch through generic registries:

- Environments: `cartpole`, `gridworld`, `snake` (register more via the `Environment` protocol).
- RL algorithms: `q_learning` (no deps), `reinforce`, `dqn`, `ppo` (Torch).
- Supervised (tabular): `logreg` and `linreg` (no deps), `mlp` (Torch), over uploaded CSV/JSONL or built-in toy datasets.

Runs, datasets, and checkpoints live under `~/.brain-spa/artifacts/ml/` and never enter git. Full reference: [ml-platform.md](ml-platform.md).

## Choosing The Path

Use a language model when the behavior is expressed in text or tool use.

Use a policy model when the behavior is expressed as actions inside a world with rewards, state, and failure labels.

Use the Studio when you want to train a fresh model — an RL policy on a registered environment, or a tabular classifier/regressor — without wiring a new bespoke harness.
