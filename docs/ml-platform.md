# ML Platform (Studio)

Brain Spa began as a Snake-only policy harness. The ML platform generalizes it
into a small, honest tool for training *any* compact model from scratch — on
your machine, with inspectable artifacts — while keeping the Evidence → Datasets
→ Tune → Test loop intact.

Everything here lives in `packages/brainspa_ml/`, is exposed under `/api/ml/*`,
and is driven from the UI at **Tune → Studio**.

## What you can train

### Reinforcement learning

| Environment | Obs | Actions | Notes |
|-------------|-----|---------|-------|
| `cartpole` | 4 (continuous) | 2 | Classic balance task. Dynamics match Gymnasium `CartPole-v1`. |
| `mountaincar` | 2 (continuous) | 3 | Build momentum to escape a valley. Sparse reward — exploration matters. |
| `gridworld` | 4 / discrete | 4 | Maze navigation. Fully discrete state — the home of tabular Q-learning. |
| `snake` | 11 | 4 | The original reference environment, now trainable through the generic registry. |

| Algorithm | Family | Deps | Best for |
|-----------|--------|------|----------|
| `q_learning` | tabular | none | Small discrete environments (GridWorld). |
| `reinforce` | policy gradient | torch | Simple, readable baseline. |
| `dqn` | value, off-policy | torch | Discrete-action control. |
| `ppo` | policy gradient (GAE) | torch | Robust default for most tasks. |

### Supervised (tabular)

Upload a CSV/JSONL (or generate a starter set: `blobs`, `moons`, `linear`),
pick a target column, and fit:

| Algorithm | Task | Deps |
|-----------|------|------|
| `logreg` | classification | none (pure-Python softmax regression) |
| `linreg` | regression | none (pure-Python least squares) |
| `mlp` | classification / regression | torch |

Features are standardized (numeric) and one-hot encoded (categorical); data is
split train/val/test; metrics are computed on the held-out test set
(accuracy/macro-F1 for classification, MSE/MAE/R² for regression).

## Architecture

```
packages/brainspa_ml/
  spaces.py          Discrete / Box space descriptors
  environments.py    Environment protocol + EnvSpec registry
  envs/              cartpole.py, gridworld.py, snake_adapter.py
  algorithms/        base.py (registry), q_learning, reinforce, dqn, ppo, torch_nets
  supervised.py      featurization + logreg/linreg/mlp + metrics + inference
  datasets.py        CSV/JSONL ingest, profiling, splitting, builtin toy sets
  runs.py            run/experiment registry (status, metric series, summary)
  jobs.py            threaded job runner + inference entry point
  paths.py           runtime home resolution (~/.brain-spa, BRAIN_SPA_HOME)
```

The seams are the point: a new environment implements the `Environment`
protocol and calls `register_env(...)`; a new algorithm provides `train`/`load`
functions and calls `register_algorithm(...)`. Nothing in the trainers is
Snake-specific.

### Artifacts

Runs and datasets are stored outside the repo under
`~/.brain-spa/artifacts/ml/`:

```
artifacts/ml/
  datasets/<id>/      data.jsonl + meta.json
  runs/<id>/          run.json + metrics.jsonl + checkpoint
  models/             (reserved)
```

## API

Mounted at `/api/ml` (see `apps/api/brainspa_api/ml_api.py`):

| Endpoint | Purpose |
|----------|---------|
| `GET /api/ml/catalog` | environments + algorithms + builtin datasets in one call |
| `GET /api/ml/datasets` · `POST /api/ml/datasets/upload` · `POST /api/ml/datasets/builtin` | dataset management |
| `POST /api/ml/train` | submit an RL or supervised job → run record |
| `GET /api/ml/runs` · `GET /api/ml/runs/{id}` | list / inspect runs (with metric series) |
| `GET /api/ml/runs/{id}/stream` | SSE live metrics |
| `POST /api/ml/runs/{id}/stop` | graceful stop |
| `POST /api/ml/runs/{id}/infer` | RL rollout or supervised prediction |

Operator skills are at `/api/agents/skills` and the recommendation/comparison
helpers at `/api/agents/recommend-algorithm` and `/api/agents/compare-runs`.

## Operator skills

The four resident worker models (Source / Data / Training / Harness) and the
Chipmunk operator now have a concrete **skill registry**
(`packages/brainspa_agents/skills.py`). Chipmunk routes free-text requests to
real backend actions — e.g. "train cartpole with ppo", "list runs",
"which algorithm for gridworld", "give me a toy classification dataset". The
registry is shown in **Settings → Agents**.

## Open-source and research lineage

The implementations are compact and educational, grounded in well-known work:

- **CleanRL** (Huang et al.) — single-file PPO/DQN conventions (orthogonal init,
  GAE, clipped objective). https://github.com/vwxyzjn/cleanrl
- **Farama Gymnasium** — classic-control dynamics; CartPole constants and
  equations of motion. https://github.com/Farama-Foundation/Gymnasium
- **OpenAI Spinning Up** — policy-gradient derivations (REINFORCE + baseline).
  https://spinningup.openai.com
- **scikit-learn** — toy-dataset shapes (blobs/moons) and supervised baselines.
  https://scikit-learn.org
- Papers: DQN — Mnih et al. 2015; PPO — Schulman et al. 2017; GAE — Schulman et
  al. 2016; REINFORCE — Williams 1992; Q-learning — Watkins & Dayan 1992.

These are referenced for algorithmic correctness; all code here is original and
dependency-light (Torch is optional; tabular and linear paths need nothing).
