# Training Methods And Open-Source References

Brain Spa runs Evidence → Datasets → Tune → Test. This doc catalogs open-source
repos and methods we can borrow from to widen that loop — pretraining, SFT,
preference tuning, RL post-training, environments, data pipelines, and eval —
without turning the product into a single demo or vendor stack.

Existing lineage already cited in [ml-platform.md](ml-platform.md): CleanRL,
Gymnasium, Spinning Up, scikit-learn. This page is the broader borrowing map.

**Rule:** borrow patterns, contracts, and small algorithms. Keep artifacts
local, inspectable, and loop-shaped. Do not vendor entire megatrain stacks into
the shell.

## How This Maps To The Loop

| Loop stage | Methods that feed it | What to automate next |
|------------|----------------------|------------------------|
| Evidence | Failure traces, judge scores, env rollouts, eval harness logs | Capture world state + action + score + failure comment into Evidence automatically |
| Datasets | SFT rows, preference pairs, RL transitions, synthetic pipelines | Convert Evidence/Test failures into typed dataset rows (instruction, chosen/rejected, transition) |
| Tune | Pretrain / continued pretrain, SFT, DPO/ORPO/KTO, PPO/GRPO, classic RL | Job recipes with dry-run → train → artifact register; Chipmunk skill routing |
| Test | Gym envs, agentic envs, LM eval harnesses, Inspect tasks | Score behavior in harnesses; feed misses back as Evidence |

## Method Catalog

### 1. Pretraining And Continued Pretraining

Train (or continue training) a base model on large unlabeled or lightly filtered
text before instruction/alignment work.

| Method | Idea | Borrow for Brain Spa |
|--------|------|----------------------|
| From-scratch pretrain | Next-token LM on cleaned web/code corpora | Small educational GPT path in Studio; packing + checkpoint cadence |
| Continued pretrain (CPT) | Domain adaptation on a base checkpoint | Domain corpora → Dataset → Tune recipe without full RLHF |
| MoE / distributed pretrain | Expert parallelism, TP/PP/DP | Long-term only; study job configs, not ship Megatron into the shell |

| Repo | What it is | Link |
|------|------------|------|
| nanoGPT | Minimal GPT pretrain/finetune; readable training loop | https://github.com/karpathy/nanoGPT |
| LitGPT | From-scratch recipes; pretrain + LoRA/QLoRA finetune | https://github.com/Lightning-AI/litgpt |
| TinyLlama | Small open LM trained with LitGPT-style stack | https://github.com/jzhang38/TinyLlama |
| Megatron-LM / Megatron Core | Industry-scale pretrain building blocks (TP/PP/EP) | https://github.com/NVIDIA/Megatron-LM |
| NVIDIA NeMo / Megatron-Bridge | Recipes + HF ↔ Megatron checkpoint bridges | https://github.com/NVIDIA/NeMo |
| Hugging Face Nanotron | Lightweight 3D-parallel pretrain framework | https://github.com/huggingface/nanotron |
| LLM360 | Fully open training data + intermediate checkpoints | https://github.com/LLM360 |
| Datatrove | Large-scale web data processing (FineWeb pipeline) | https://github.com/huggingface/datatrove |
| FineWeb | Cleaned CommonCrawl-scale pretrain corpus | https://huggingface.co/datasets/HuggingFaceFW/fineweb |
| DeepSpeed | ZeRO / memory-efficient distributed training | https://github.com/microsoft/DeepSpeed |

**Automation lean:** a CPT job type that takes a local corpus path, packs
sequences, streams loss, and writes a named Tune artifact under
`~/.brain-spa/artifacts/`.

### 2. Supervised Fine-Tuning (SFT)

Teach instruction following or task format from (prompt, completion) rows.

| Method | Idea | Borrow for Brain Spa |
|--------|------|----------------------|
| Full SFT | Update all weights on instruction data | Compact Torch trainers; packing; chat-template discipline |
| LoRA / QLoRA / adapters | Parameter-efficient SFT | Default local Tune path; adapter artifacts already fit the product |
| Packing / sequence packing | Concatenate short samples | Throughput without changing dataset schema |

| Repo | What it is | Link |
|------|------------|------|
| Hugging Face TRL (`SFTTrainer`) | Standard HF post-train entry for SFT | https://github.com/huggingface/trl |
| Axolotl | YAML-driven SFT / CPT / RLHF recipes | https://github.com/axolotl-ai-cloud/axolotl |
| LLaMA-Factory | Broad model coverage; UI + CLI finetune | https://github.com/hiyouga/LLaMA-Factory |
| Unsloth | Fast single-node QLoRA / SFT kernels | https://github.com/unslothai/unsloth |
| PEFT | LoRA / adapter library used by most stacks | https://github.com/huggingface/peft |
| OpenRLHF SFT scripts | Production-shaped SFT with packing | https://github.com/OpenRLHF/OpenRLHF |

**Automation lean:** Evidence → “instruction row” exporter; Datasets page shows
latest SFT shard; Tune dry-run validates chat template + token budget.

### 3. Preference And Alignment (No Online RL)

Align from pairwise or binary feedback without a full PPO loop.

| Method | Idea | Typical data |
|--------|------|--------------|
| DPO | Direct preference optimization from chosen/rejected | Pair preferences |
| IPO | Identity preference optimization (DPO variant) | Pair preferences |
| ORPO | Odds-ratio preference; SFT + preference in one stage | Pair preferences |
| KTO | Align from desirable/undesirable labels (no pairs) | Binary feedback |
| SimPO / CPO family | Reference-free or alternative preference losses | Pair preferences |
| Reward model (RM) / PRM | Score responses or reasoning steps | Ranked or step labels |

| Repo | What it is | Link |
|------|------------|------|
| TRL (`DPOTrainer`, `KTOTrainer`, …) | Canonical HF preference trainers | https://github.com/huggingface/trl |
| Axolotl RLHF docs | DPO/IPO/KTO/ORPO/GRPO/SimPO configs | https://docs.axolotl.ai/docs/rlhf.html |
| OpenRLHF | SFT + DPO + RM + online RL in one Ray stack | https://github.com/OpenRLHF/OpenRLHF |
| distilabel | Synthetic data + AI feedback pipelines for DPO-ready sets | https://github.com/argilla-io/distilabel |
| Argilla | Human/AI curation UI for preference datasets | https://github.com/argilla-io/argilla |

**Automation lean:** Test failures → chosen/rejected pairs (good fix vs bad
attempt); KTO path when only thumbs-up / thumbs-down Evidence exists.

### 4. RL Post-Training For Language / Agents

Online RL against a reward (verifiable or model-based). Heavyweight stacks teach
orchestration; keep Brain Spa’s loop as the UX.

| Method | Idea | Notes |
|--------|------|-------|
| PPO (RLHF) | Actor + critic + reward (+ optional ref KL) | Classic; memory-heavy |
| GRPO | Group-relative advantages; no critic | Used in DeepSeek-R1-style reasoning trains |
| RLOO | REINFORCE leave-one-out baseline | Simple variance reduction |
| DAPO / Dr.GRPO / GSPO / … | Clipping, sampling, sequence-level IS variants | See AReaL algorithm matrix |
| RLVR | RL with verifiable rewards (math, code, unit tests) | Natural fit for harness scoring |
| Agentic RL | Multi-turn tool/env rollouts + delayed reward | Matches Brain Spa harness idea |

| Repo | What it is | Link |
|------|------------|------|
| verl (HybridFlow) | Flexible RL post-train; FSDP/Megatron + vLLM/SGLang | https://github.com/verl-project/verl |
| OpenRLHF | Ray + vLLM agentic RLHF / RLVR | https://github.com/OpenRLHF/OpenRLHF |
| TRL (`GRPOTrainer`, PPO) | Accessible GRPO/PPO on HF models | https://github.com/huggingface/trl |
| AReaL | PPO/GRPO family with shared config knobs | https://github.com/areal-project/AReaL |
| tiny-grpo / mini-grpo | Small hackable GRPO references | https://github.com/open-thought/tiny-grpo · https://github.com/JialiangFan/mini-grpo |
| NeMo-Aligner | NVIDIA alignment / RLHF recipes | https://github.com/NVIDIA/NeMo-Aligner |
| DeepSpeed-Chat | Earlier open RLHF reference | https://github.com/microsoft/DeepSpeedExamples |

**Automation lean:** harness score → reward fn; parallel env workers already
match `/test/snake/autonomous-train`; GRPO-style group sampling on shared
prompts when LLM Tune lands.

### 5. Classic RL Algorithms And Control Envs

Already partially in Studio ([ml-platform.md](ml-platform.md)).

| Method / env family | Borrow from | Link |
|---------------------|-------------|------|
| PPO / DQN / single-file trainers | CleanRL | https://github.com/vwxyzjn/cleanrl |
| Policy gradient pedagogy | OpenAI Spinning Up | https://spinningup.openai.com |
| Env API (`reset`/`step`) | Farama Gymnasium | https://github.com/Farama-Foundation/Gymnasium |
| Multi-agent | PettingZoo | https://github.com/Farama-Foundation/PettingZoo |
| Games / imperfect info | OpenSpiel | https://github.com/google-deepmind/open_spiel |
| Atari / classic control wrappers | Gymnasium + ALE | https://github.com/Farama-Foundation/Arcade-Learning-Environment |
| Stable-Baselines3 | Battle-tested algorithm APIs | https://github.com/DLR-RM/stable-baselines3 |

**Automation lean:** register more `Environment` protocol adapters; keep
algorithm registry thin and CleanRL-shaped.

### 6. Agentic Environments And Harnesses

A harness is world state, tools, allowed actions, and scoring — the same
definition Brain Spa uses ([environment-harness-spec.md](environment-harness-spec.md)).

| Repo | What it is | Link |
|------|------------|------|
| OpenEnv | Gymnasium-style agentic env publishing / client-server / Docker | https://github.com/huggingface/OpenEnv · https://huggingface.co/openenv |
| BrowserGym | Browser agent env + web benchmarks | https://github.com/ServiceNow/BrowserGym |
| TextArena | Text game RL environments | https://github.com/TextArena/TextArena |
| SWE-bench | Real GitHub issue resolution eval | https://github.com/SWE-bench/SWE-bench |
| SWE-gym / coding agent trains | Train envs built on software tasks | Search ecosystem around SWE-bench training forks |
| MiniWoB / WebArena (via BrowserGym) | Web interaction benchmarks | Via BrowserGym docs |
| MCP-capable envs | Tool discovery through env API (OpenEnv RFC path) | OpenEnv releases / RFCs |

**Automation lean:** Brain Spa harness contract ↔ OpenEnv-style
`reset`/`step`/`state`; publish Snake as a reference env package; delayed
reward + failure comments already match agentic scoring needs.

### 7. Data Curation And Synthetic Pipelines

| Repo / resource | What it is | Link |
|-----------------|------------|------|
| distilabel | Paper-based synthetic generation + judge pipelines | https://github.com/argilla-io/distilabel |
| Argilla | Review / filter / relabel preference data | https://github.com/argilla-io/argilla |
| Hugging Face Datasets | Hub loaders + streaming | https://github.com/huggingface/datasets |
| Datatrove / FineWeb | Pretrain corpus cleaning | https://github.com/huggingface/datatrove |
| UltraFeedback-style sets | Multi-aspect AI preference judgments | Common via Argilla / distilabel collections |

**Automation lean:** Chipmunk skill that runs a fixed “generate → judge →
format DPO/SFT” pipeline into `~/.brain-spa/artifacts/datasets/`.

### 8. Evaluation Harnesses (Test Stage)

| Repo | What it is | Link |
|------|------------|------|
| EleutherAI lm-evaluation-harness | Few-shot LM benchmarks; Open LLM Leaderboard backend | https://github.com/EleutherAI/lm-evaluation-harness |
| Inspect AI (UK AISI) | Agentic / tool / multi-turn eval framework | https://github.com/UKGovernmentBEIS/inspect_ai |
| LightEval | HF-oriented eval suite | https://github.com/huggingface/lighteval |
| OpenEnv EvalHarness / LLM-as-judge | Env-native scoring + delayed rewards | OpenEnv release notes |
| HELM | Broad scenario-based LM evaluation | https://github.com/stanford-crfm/helm |

**Automation lean:** after Tune completes, enqueue a Test job; write a short
eval report artifact; promote regressions into Evidence automatically.

## Priority Borrow List For Brain Spa

Ordered by fit to the current shell (local, artifact-driven, harness-first):

1. **OpenEnv + Gymnasium contracts** — standardize custom harnesses and remote
   env servers without changing the UI loop.
2. **CleanRL / Studio expansion** — more envs and single-file algorithms; keep
   educational and dependency-light.
3. **TRL SFT + DPO/KTO + GRPO** — when LLM Tune is in scope; adapter artifacts
   and HF datasets map cleanly to Datasets → Tune.
4. **distilabel / Argilla patterns** — Evidence and Datasets automation for
   synthetic pairs and human review.
5. **Inspect AI / lm-eval** — Test-stage scoring that is not Snake-specific.
6. **nanoGPT / LitGPT** — optional small pretrain/CPT path for Studio honesty
   (“train something from scratch”).
7. **verl / OpenRLHF** — study orchestration (rollout workers, reward loop,
   Ray placement); do not absorb wholesale.

## Automation Sketch (Chipmunk + Workers)

Concrete skills the operator stack could grow toward:

| Skill shape | Worker | Trigger |
|-------------|--------|---------|
| `ingest-failure` | Source (Evidence) | Test miss or harness failure comment |
| `rows-from-evidence` | Data (Datasets) | New Evidence batch → SFT / preference / transition rows |
| `dry-run-train` | Training (Tune) | Validate recipe, deps, token budget |
| `train-recipe` | Training (Tune) | Named recipe: `sft`, `dpo`, `grpo`, `ppo-env`, `cpt` |
| `eval-harness` | Harness (Test) | Post-train eval; write report artifact |
| `close-the-loop` | Chipmunk | Chain miss → Evidence → Datasets → Tune → Test |

Keep skills thin: they call existing `/api/*` surfaces and write under
`~/.brain-spa`. Prefer recipe YAML inspired by Axolotl/TRL CLI flags over a
new configuration language.

## What Not To Do

- Do not make the product about one adapter, one bot, or one chess/Snake demo.
- Do not commit weights, rollouts, or eval screenshots.
- Do not replace the four-stage loop with a mega training dashboard.
- Do not copy corporate “platform” copy; keep docs mechanical and artifact-named.

## Related Docs

- [ml-platform.md](ml-platform.md) — Studio algorithms and current OSS lineage
- [loop-pipeline-and-feedback.md](loop-pipeline-and-feedback.md) — feedback rule
- [environment-harness-spec.md](environment-harness-spec.md) — harness contract
- [custom-harnesses.md](custom-harnesses.md) — adding environments
- [ml-model-types.md](ml-model-types.md) — policy vs supervised model types
