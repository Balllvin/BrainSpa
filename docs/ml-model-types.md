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

## Choosing The Path

Use a language model when the behavior is expressed in text or tool use.

Use a policy model when the behavior is expressed as actions inside a world with rewards, state, and failure labels.
