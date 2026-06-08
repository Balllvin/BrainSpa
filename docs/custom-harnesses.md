# Custom Harnesses

A Brain Spa harness is the world, tools, actions, scoring rules, and failure comments an AI receives. Harnesses are used by the resident workers and by models being tested.

## Required Shape

Every harness must define:

- `world_state`: serializable facts available at each step
- `allowed_actions`: legal actions and when they are valid
- `tools`: local or external tools the worker/model may call
- `scoring_rules`: reproducible checks, not vibes
- `failure_comments`: compact labels that can become future dataset requirements
- `template_artifacts`: files the harness writes or reads

## Snake As The Reference

Snake 10x10 is the reference harness because it proves the full loop without shipping a model:

- the environment is deterministic when seeded
- actions are explicit: turn left, go straight, turn right, or reverse-blocked behavior
- rewards are decomposed into named components
- Test pages expose multiple scenario shapes
- Tune can start from no checkpoint and train locally
- Datasets can show rollout rows only after the environment has run

Future harnesses should copy that discipline. They should not copy Snake visuals unless the world is a grid game.

## Test UI Standard

Use `/test/snake/autonomous-train` as the quality bar:

- show the world immediately, even before a run starts
- put primary controls and live stats together
- show parallel environment instances when parallelism is part of the job
- avoid decorative wrappers around compact boards
- keep labels short and metric-backed
- make one primary action obvious
- keep generated run artifacts outside the repository

## Shipping Rule

GitHub gets harness source and instructions. Local runtime gets harness outputs.

Do not commit generated checkpoints, adapter weights, rollout data, eval output, or screenshots unless the project explicitly changes the public artifact policy.
