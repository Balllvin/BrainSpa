# Training Methods And Open-Source References

Brain Spa runs Evidence → Datasets → Tune → Test. This doc catalogs open-source
repos and methods we can borrow from to widen that loop — pretraining, SFT,
preference tuning, RL post-training, environments, data cleaning, novel
alignment tricks, and eval — without turning the product into a single demo or
vendor stack.

Existing lineage already cited in [ml-platform.md](ml-platform.md): CleanRL,
Gymnasium, Spinning Up, scikit-learn. This page is the broader borrowing map.

**Rule:** borrow patterns, contracts, and small algorithms. Keep artifacts
local, inspectable, and loop-shaped. Do not vendor entire megatrain stacks into
the shell.

## How This Maps To The Loop

| Loop stage | Methods that feed it | What to automate next |
|------------|----------------------|------------------------|
| Evidence | Failure traces, judge scores, env rollouts, eval harness logs, **token forks + logits** | Capture world state + action + score + failure comment; also prefix, chosen token, alts, and why |
| Datasets | Cleaning, dedup, SFT rows, preference pairs, RL transitions, **token edits / vine rollouts** | Clean → filter → type rows; emit `token_edit` and `prefix_branch` rows from Evidence |
| Tune | Pretrain / CPT, SFT, DPO/ORPO/KTO/SimPO, PPO/GRPO/GSPO, **token-level RL / VinePPO / TDPO**, distillation | Job recipes with dry-run → train → artifact register; Chipmunk skill routing |
| Test | Gym envs, agentic envs, LM eval harnesses, Inspect / NeMo Gym, **alternate-route viewers** | Score behavior; fork from any token and compare routes; promote misses to Evidence |

## Priority Borrow List For Brain Spa

Ordered by fit to the current shell (local, artifact-driven, harness-first):

1. **Unsloth** — fast local SFT / QLoRA / GRPO / GSPO / DPO on one GPU; TRL-compatible; strongest near-term LLM Tune backend for Brain Spa machines.
2. **Token-level credit + counterfactual forks** — inspect why a token was chosen, mark a better token, RL on that edit, and explore alternate routes from the same prefix (see dedicated section below).
3. **OpenEnv + Gymnasium (+ NeMo Gym patterns)** — standardize custom harnesses and remote env servers without changing the UI loop.
4. **Data cleaning pipeline (Datatrove / Dolma / NeMo Curator ideas)** — exact/fuzzy/semantic dedup, heuristic quality filters, language ID, PII scrub before Datasets → Tune.
5. **CleanRL / Studio expansion** — more envs and single-file algorithms; keep educational and dependency-light.
6. **TRL trainers (via Unsloth or plain HF)** — SFT, DPO/KTO, GRPO when LLM Tune is in scope.
7. **distilabel / Argilla / SPIN-style self-play** — Evidence and Datasets automation for synthetic pairs, judges, and preference from SFT alone.
8. **Inspect AI / lm-eval / NeMo Gym eval surfaces** — Test-stage scoring that is not Snake-specific.
9. **NVIDIA NeMo RL / Gym / Curator / Megatron** — study orchestration, env catalogs, GPU curation, and recipes; do not absorb wholesale.
10. **nanoGPT / LitGPT** — optional small pretrain/CPT path for Studio honesty.

---

## Unsloth (Local First)

Unsloth is one of the best open stacks for *local* post-training: hand-written
Triton kernels, low VRAM, and TRL-compatible trainers. Prefer it as the default
single-node LLM Tune engine when Brain Spa grows beyond compact Torch Studio
jobs.

| Capability | Why it matters here |
|------------|---------------------|
| SFT / full FT / LoRA / QLoRA / 8-bit | Adapter artifacts match Brain Spa’s Tune model |
| GRPO + vLLM fast inference | Reasoning / RLVR on one GPU; long-context batching |
| GSPO, DPO, and other TRL RLHF methods | Preference + group RL without a cluster |
| Pretraining / continued pretrain paths | Small CPT jobs on domain corpora |
| Export to HF / llama.cpp / Ollama / vLLM | Keep Test and deploy paths open |

| Repo / docs | Link |
|-------------|------|
| Unsloth | https://github.com/unslothai/unsloth |
| TRL ↔ Unsloth integration | https://huggingface.co/docs/trl/en/unsloth_integration |
| Unsloth RL / GRPO guide | https://unsloth.ai/docs/get-started/reinforcement-learning-rl-guide |

**Automation lean:** `train-recipe: unsloth-sft | unsloth-dpo | unsloth-grpo`
with dry-run for VRAM estimate, chat template check, and adapter output under
`~/.brain-spa/artifacts/training/`.

---

## NVIDIA Open-Source Ecosystem

NVIDIA’s public GitHub orgs (`NVIDIA`, `NVIDIA-NeMo`) cover data curation,
pretrain, post-train RL, agentic gyms, inference, and quantization. Use them as
*reference systems* for recipes and contracts; keep Brain Spa’s UX as the loop.

### Training And Alignment

| Repo | What it is | Link |
|------|------------|------|
| Megatron-LM / Megatron Core | Scale pretrain building blocks (TP/PP/DP/EP, MoE, FP8) | https://github.com/NVIDIA/Megatron-LM |
| NeMo Framework | End-to-end generative AI training / customization | https://github.com/NVIDIA/NeMo |
| Megatron-Bridge | Bidirectional HF ↔ Megatron checkpoint + recipes | https://github.com/NVIDIA-NeMo/Megatron-Bridge |
| **NeMo RL** | Current post-train RL library (successor to NeMo-Aligner): GRPO, PPO, SFT, DPO, RM, on-policy distillation, MOPD; Ray + Megatron/DTensor + vLLM | https://github.com/NVIDIA-NeMo/RL |
| NeMo-Aligner | Legacy alignment toolkit (SteerLM, DPO, RLHF); prefer NeMo RL | https://github.com/NVIDIA/NeMo-Aligner |
| NeMo Gym | Env + eval infrastructure for agents; trains with NeMo RL, Unsloth, verl | https://github.com/NVIDIA-NeMo/Gym |
| Nemotron recipes | Open Nemotron model / data / curation recipes | https://github.com/NVIDIA-NeMo/Nemotron |

NeMo RL algorithm surface worth tracking: GRPO, PPO, SFT, DPO, reward models,
on-policy distillation, multi-teacher on-policy distillation (MOPD), LoRA,
quantization-aware GRPO via ModelOpt, NeMo Gym env integration.

### Data Cleaning And Curation

| Repo | What it is | Link |
|------|------------|------|
| **NeMo Curator** | GPU-accelerated text/image/video/audio curation: download, clean, language ID, quality filters, PII, exact/fuzzy/semantic dedup | https://github.com/NVIDIA-NeMo/Curator |

### Inference And Optimization (Test / rollout workers)

| Repo | What it is | Link |
|------|------------|------|
| TensorRT-LLM | High-throughput LLM inference engine | https://github.com/NVIDIA/TensorRT-LLM |
| Model Optimizer (ModelOpt) | Quantization, QAT, sparsity; used with NeMo RL FP8/NVFP4 paths | https://github.com/NVIDIA/Model-Optimizer |

**Borrow specifically:**

- NeMo Gym’s “env catalog + train/eval entrypoints” shape for Brain Spa Test
- NeMo Curator’s filter stages as a Datasets preprocess skill (even if CPU-only
  first: length, repetition, language, exact hash dedup)
- NeMo RL’s recipe YAML and async rollout / reward loop as a Chipmunk job model
- Megatron-Bridge only if/when HF adapters need Megatron-scale runs

---

## Method Catalog

### 1. Pretraining And Continued Pretraining

| Method | Idea | Borrow for Brain Spa |
|--------|------|----------------------|
| From-scratch pretrain | Next-token LM on cleaned web/code corpora | Small educational GPT path in Studio; packing + checkpoint cadence |
| Continued pretrain (CPT) | Domain adaptation on a base checkpoint | Domain corpora → clean → Dataset → Tune recipe |
| MoE / distributed pretrain | Expert parallelism, TP/PP/DP | Long-term; study Megatron/NeMo configs, do not ship into the shell |

| Repo | What it is | Link |
|------|------------|------|
| nanoGPT | Minimal GPT pretrain/finetune; readable training loop | https://github.com/karpathy/nanoGPT |
| LitGPT | From-scratch recipes; pretrain + LoRA/QLoRA finetune | https://github.com/Lightning-AI/litgpt |
| TinyLlama | Small open LM trained with LitGPT-style stack | https://github.com/jzhang38/TinyLlama |
| Unsloth | Local CPT / pretrain-friendly kernels | https://github.com/unslothai/unsloth |
| Megatron-LM / Megatron Core | Industry-scale pretrain | https://github.com/NVIDIA/Megatron-LM |
| NVIDIA NeMo | Framework recipes around Megatron | https://github.com/NVIDIA/NeMo |
| Hugging Face Nanotron | Lightweight 3D-parallel pretrain | https://github.com/huggingface/nanotron |
| LLM360 | Fully open training data + intermediate checkpoints | https://github.com/LLM360 |
| DeepSpeed | ZeRO / memory-efficient distributed training | https://github.com/microsoft/DeepSpeed |

### 2. Supervised Fine-Tuning (SFT)

| Method | Idea | Borrow for Brain Spa |
|--------|------|----------------------|
| Full SFT | Update all weights on instruction data | Compact trainers; packing; chat-template discipline |
| LoRA / QLoRA / adapters | Parameter-efficient SFT | Default local Tune path |
| Packing / sequence packing | Concatenate short samples | Throughput without schema change |

| Repo | What it is | Link |
|------|------------|------|
| **Unsloth** | Fast local SFT / QLoRA; TRL-compatible | https://github.com/unslothai/unsloth |
| Hugging Face TRL (`SFTTrainer`) | Standard HF SFT trainer | https://github.com/huggingface/trl |
| Axolotl | YAML-driven SFT / CPT / RLHF recipes | https://github.com/axolotl-ai-cloud/axolotl |
| LLaMA-Factory | Broad model coverage; UI + CLI | https://github.com/hiyouga/LLaMA-Factory |
| PEFT | LoRA / adapter library | https://github.com/huggingface/peft |
| OpenRLHF SFT | Production-shaped SFT with packing | https://github.com/OpenRLHF/OpenRLHF |
| NeMo RL SFT | Scalable SFT recipes in NeMo RL | https://github.com/NVIDIA-NeMo/RL |
| AllenAI Open-Instruct / Tulu | Open instruction-tuning recipes and data | https://github.com/allenai/open-instruct |

### 3. Preference And Alignment (No Online RL)

| Method | Idea | Typical data |
|--------|------|--------------|
| DPO | Direct preference optimization from chosen/rejected | Pair preferences |
| IPO | Identity preference optimization (DPO variant) | Pair preferences |
| ORPO | Odds-ratio preference; SFT + preference in one stage | Pair preferences |
| KTO | Align from desirable/undesirable labels (no pairs) | Binary feedback |
| SimPO / CPO family | Reference-free or alternative preference losses | Pair preferences |
| Reward model (RM) / PRM | Score responses or reasoning steps | Ranked or step labels |
| SPIN | Self-play: prefer human SFT targets over own older generations | SFT set only (iterative) |

| Repo | What it is | Link |
|------|------------|------|
| TRL (`DPOTrainer`, `KTOTrainer`, …) | Canonical HF preference trainers | https://github.com/huggingface/trl |
| Unsloth | Local DPO / preference via TRL path | https://github.com/unslothai/unsloth |
| Axolotl RLHF docs | DPO/IPO/KTO/ORPO/GRPO/SimPO configs | https://docs.axolotl.ai/docs/rlhf.html |
| OpenRLHF | SFT + DPO + RM + online RL | https://github.com/OpenRLHF/OpenRLHF |
| SPIN | Self-play fine-tuning without extra preference labels | https://github.com/uclaml/SPIN |
| NeMo RL (DPO / RM) | Scalable preference + reward-model recipes | https://github.com/NVIDIA-NeMo/RL |

### 4. RL Post-Training For Language / Agents

| Method | Idea | Notes |
|--------|------|-------|
| PPO (RLHF) | Actor + critic + reward (+ optional ref KL) | Classic; memory-heavy |
| GRPO | Group-relative advantages; no critic | DeepSeek-R1-style reasoning |
| GSPO | Sequence-level importance ratio + clipping | More stable than token-level GRPO; MoE-friendly (Qwen) |
| RLOO | REINFORCE leave-one-out baseline | Simple variance reduction |
| DAPO / Dr.GRPO / LitePPO / … | Clipping, dynamic sampling, norm variants | See AReaL / NeMo RL matrices |
| RLVR | RL with verifiable rewards (math, code, unit tests) | Natural fit for harness scoring |
| Agentic RL | Multi-turn tool/env rollouts + delayed reward | Matches Brain Spa harness idea |
| On-policy distillation / MOPD | Distill teacher(s) on student rollouts (dense token signal) | NeMo RL; multi-teacher capability merge |

| Repo | What it is | Link |
|------|------------|------|
| **Unsloth** | Local GRPO/GSPO with vLLM; long-context RL | https://github.com/unslothai/unsloth |
| **NeMo RL** | Scalable GRPO/PPO/distillation + NeMo Gym | https://github.com/NVIDIA-NeMo/RL |
| verl (HybridFlow) | Flexible RL post-train; FSDP/Megatron + vLLM/SGLang | https://github.com/verl-project/verl |
| OpenRLHF | Ray + vLLM agentic RLHF / RLVR | https://github.com/OpenRLHF/OpenRLHF |
| TRL (`GRPOTrainer`, PPO) | Accessible GRPO/PPO on HF models | https://github.com/huggingface/trl |
| AReaL | PPO/GRPO family with shared config knobs | https://github.com/areal-project/AReaL |
| SkyRL | Research RL stack inspired by NeMo-Aligner lineage | https://github.com/NovaSky-AI/SkyRL |
| ROLL | Alibaba open RL post-train framework | https://github.com/alibaba/ROLL |
| tiny-grpo / mini-grpo | Small hackable GRPO references | https://github.com/open-thought/tiny-grpo · https://github.com/JialiangFan/mini-grpo |
| DeepSpeed-Chat | Earlier open RLHF reference | https://github.com/microsoft/DeepSpeedExamples |

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

### 6. Agentic Environments And Harnesses

A harness is world state, tools, allowed actions, and scoring — the same
definition Brain Spa uses ([environment-harness-spec.md](environment-harness-spec.md)).

| Repo | What it is | Link |
|------|------------|------|
| OpenEnv | Gymnasium-style agentic env publishing / client-server / Docker | https://github.com/huggingface/OpenEnv · https://huggingface.co/openenv |
| **NeMo Gym** | Env + eval infrastructure; GRPO tutorials with NeMo RL / Unsloth / verl | https://github.com/NVIDIA-NeMo/Gym |
| BrowserGym | Browser agent env + web benchmarks | https://github.com/ServiceNow/BrowserGym |
| TextArena | Text game RL environments | https://github.com/TextArena/TextArena |
| SWE-bench | Real GitHub issue resolution eval | https://github.com/SWE-bench/SWE-bench |
| MiniWoB / WebArena (via BrowserGym) | Web interaction benchmarks | Via BrowserGym docs |
| MCP-capable envs | Tool discovery through env API (OpenEnv RFC path) | OpenEnv releases / RFCs |

### 7. Data Cleaning, Dedup, And Curation

Quality of Datasets dominates Tune outcomes. Treat cleaning as a first-class
Datasets stage, not an afterthought.

| Stage | Techniques | Borrow from |
|-------|------------|-------------|
| Ingest | Download, extract, WARC → text, schema normalize | Datatrove, NeMo Curator, Dolma |
| Language / script | Language ID, non-English routing | FastText LID, Curator language modules |
| Heuristic quality | Length, repetition, URL ratio, boilerplate, symbol ratio | Curator heuristics, FineWeb filters, Dolma |
| Exact dedup | Hash (MD5/SHA) document or paragraph | All three stacks |
| Fuzzy dedup | MinHash + LSH near-duplicates | NeMo Curator (GPU), Datatrove |
| Semantic dedup | Embedding similarity clusters | NeMo Curator semantic dedup |
| Privacy / safety | PII redaction, toxicity / NSFW filters | NeMo Curator privacy + classifiers |
| Domain / quality classifiers | Keep high-educational / in-domain docs | FineWeb-Edu style classifiers, Curator |
| Preference / SFT scrub | Drop ties, swap chosen/rejected via judge, length filters | distilabel, Argilla, UltraFeedback fixes |
| Rejection sampling | Keep only generations that pass a verifier | RLVR / math-code pipelines |

| Repo / resource | What it is | Link |
|-----------------|------------|------|
| **NeMo Curator** | GPU text/image/video/audio curation pipelines | https://github.com/NVIDIA-NeMo/Curator |
| Datatrove | Large-scale web processing (FineWeb pipeline) | https://github.com/huggingface/datatrove |
| FineWeb / FineWeb-Edu | Cleaned CommonCrawl + educational quality scoring | https://huggingface.co/datasets/HuggingFaceFW/fineweb |
| Dolma | AllenAI open corpus toolkit + recipes | https://github.com/allenai/dolma |
| distilabel | Synthetic generation + AI feedback / judge pipelines | https://github.com/argilla-io/distilabel |
| Argilla | Human/AI review UI for preference and label cleanup | https://github.com/argilla-io/argilla |
| Hugging Face Datasets | Hub loaders + streaming | https://github.com/huggingface/datasets |

**Automation lean:** `clean-dataset` Chipmunk skill — configurable stages
(lang → heuristics → exact dedup → optional fuzzy) writing a new dataset
artifact and a short QC report (kept / dropped counts).

### 8. Token-Level Credit, Counterfactual Edits, Alternate Routes

This is the method family closest to: *“RL on whether a token was right, see
why it was chosen, mark another token that should have been chosen, train on
that, and inspect other routes if one token changed.”*

Language generation is an MDP where the state is the prefix (prompt + tokens so
far) and the action is the next token. That property is the whole game: you can
**reset to any prefix** by re-feeding it, then sample different continuations
(“vines” / forks). Brain Spa can treat that as a first-class Test + Evidence
surface, then feed dense signals into Tune.

#### Operator loop (what the UI should eventually do)

1. **Run** a generation (or harness trajectory) and keep per-step logits / top-k.
2. **Inspect a token** — show chosen token, probability, rank, and top-k
   alternatives (the “why this token” view).
3. **Mark a correction** — pick another token that *should* have been chosen at
   that index (human, verifier, or judge).
4. **Fork routes** — from that prefix, sample K continuations with the original
   token vs the corrected token (and optionally other top-k alts).
5. **Score branches** — outcome reward (pass/fail), PRM step scores, or harness
   metrics on each fork.
6. **Emit training rows** — token preference, dense advantages, or counterfactual
   edit pairs → Datasets → Tune.
7. **RL update** — upweight the better token / better vines; downweight the bad
   choice at that prefix.

```text
prefix s_t = [prompt + tokens_0..t-1]
action a_t = token_t          (factual)
action a'_t = corrected token (counterfactual)

fork A: continue from (s_t, a_t)  → routes R1..Rk   score each
fork B: continue from (s_t, a'_t) → routes R'1..R'k score each

advantage ≈ mean(score|a'_t) - mean(score|a_t)   # or MC value at s_t
Evidence artifact stores: prefix, a_t, a'_t, top-k, forks, scores
```

#### Building blocks to borrow

| Piece | What it gives you | Repo / paper |
|-------|-------------------|--------------|
| **Prefix reset + MC vines** | Unbiased value / credit at any token by resampling continuations | [VinePPO](https://github.com/McGill-NLP/VinePPO) · [arxiv:2410.01679](https://arxiv.org/abs/2410.01679) |
| **Token-level preference (TDPO)** | DPO-style loss at token granularity, not whole sequence | [Token-level DPO](https://github.com/vance0124/Token-level-Direct-Preference-Optimization) |
| **Process reward models (PRM)** | Score intermediate steps / tokens without waiting for final answer | Math-Shepherd lineage · PRM-guided tree search papers |
| **Tree / MCTS search** | Explicit alternate routes at decode time (ToT, MCTS, TreePO) | [Tree of Thoughts](https://github.com/princeton-nlp/tree-of-thought-llm) · [TreePO](https://github.com/multimodal-art-projection/TreePO) · PPL-MCTS |
| **Counterfactual token SCMs** | Formal “what would have been generated if token i changed” under fixed noise | [Counterfactual Token Generation](https://arxiv.org/abs/2409.17027) |
| **Hindsight / counterfactual credit** | Attribute final reward back to specific tokens or turns | Survey: [Credit Assignment in RL for LLMs](https://arxiv.org/abs/2604.09459) · CCPO / C3 / HCAPO family |
| **TP-GRPO / generative PRM** | Teach the model to judge its own thinking steps for denser RL | [TP-GRPO](https://github.com/cs-holder/tp_grpo) |
| **Top-k / logit dumps at Test** | Cheap “why this token” without a new trainer | Any HF `generate(..., output_scores=True)` or vLLM logprobs |

#### Artifact shape (Evidence / Datasets)

Keep one inspectable JSONL-ish record per fork point:

```json
{
  "prefix_id": "...",
  "prefix_tokens": ["..."],
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

Tune recipes that can consume these rows:

| Recipe | Signal |
|--------|--------|
| `token-dpo` / TDPO | chosen vs corrected token (or best vs worst vine) at index `t` |
| `vine-ppo` / dense PPO | MC advantages from prefix forks |
| `token-grpo` | Group of continuations from same prefix; relative scores |
| `edit-sft` | Force-decode corrected token then continue (teacher-style) |
| `reject-at-token` | Keep only vines that pass after the edit |

#### Why this fits Brain Spa

- Test already shows live world state; a **token fork viewer** is the LM analogue
  of watching alternate Snake trajectories from the same board.
- Evidence becomes precise: not “bad answer,” but “at index 17, `therefore` beat
  `however`; forks prove `however` recovers.”
- Datasets stay typed and local under `~/.brain-spa`.
- Chipmunk can own `inspect-token` → `fork-routes` → `rows-from-forks` →
  `train-recipe: vine-ppo|token-dpo`.

### 9. Novel And Emerging Methods (Borrow Selectively)

Newer ideas that change *how* a loop stage works — not just which trainer:

| Method | Novelty | Brain Spa angle |
|--------|---------|-----------------|
| **Token-level RL / VinePPO** | MC credit at any prefix via continuation forks | Core of token inspect → correct → RL (section 8) |
| **TDPO / token preference** | Preference loss on individual tokens | Human “this token should’ve been X” → Tune |
| **Counterfactual token forks** | Change one token, resample the rest | Alternate-route viewer in Test |
| **Tree search / MCTS / TreePO** | Explicit multi-path decode + train on trees | Explore routes without waiting for full RL |
| **ORPO** | One-stage SFT + preference (odds ratio) | Fewer Tune jobs; single recipe from preference-ish Evidence |
| **SimPO** | No reference model; avg logprob as implicit reward | Lower VRAM preference tune |
| **SPIN** | Self-play against older self using only SFT data | Improve models when no preference labels exist |
| **GRPO** | Group-relative advantages; drop critic | Default LLM RL recipe for harness rewards |
| **GSPO** | Sequence-level IS + clip (vs token-level GRPO) | More stable long-trace / MoE RL |
| **DAPO** | Dynamic sampling + decoupled clip for long CoT | Stabilise reasoning Trace RL |
| **RLVR** | Verifiable rewards (unit tests, math checkers) | Map harness scorers → reward fns directly |
| **On-policy distillation / MOPD** | Dense teacher token advantages on student rollouts | Merge specialist teachers without Mix-RL pain |
| **Rejection sampling / best-of-N → SFT** | Filter generations with a verifier, then SFT | Simple Datasets→Tune path before full RL |
| **Process reward models (PRM)** | Step-level rewards for reasoning | Score intermediate steps / tokens, not only finals |
| **Async / disagg rollouts** | Inference workers ≠ train workers | Parallel Test boards already rhyme; LLM Tune can copy |
| **Curriculum / difficulty filters** | Train on solvable-but-hard prompts only | Evidence tagging by failure mode + hardness |
| **Constitutional / RLAIF judges** | Model-written critiques → preferences | Evidence auto-judge before human review |
| **SteerLM-style attribute control** | Condition on multi-attribute scores | Multi-label Evidence → controlled generation |

### 10. Evaluation Harnesses (Test Stage)

| Repo | What it is | Link |
|------|------------|------|
| EleutherAI lm-evaluation-harness | Few-shot LM benchmarks; Open LLM Leaderboard backend | https://github.com/EleutherAI/lm-evaluation-harness |
| Inspect AI (UK AISI) | Agentic / tool / multi-turn eval framework | https://github.com/UKGovernmentBEIS/inspect_ai |
| LightEval | HF-oriented eval suite | https://github.com/huggingface/lighteval |
| NeMo Gym | Env-backed eval + training environments | https://github.com/NVIDIA-NeMo/Gym |
| OpenEnv EvalHarness / LLM-as-judge | Env-native scoring + delayed rewards | OpenEnv release notes |
| HELM | Broad scenario-based LM evaluation | https://github.com/stanford-crfm/helm |

---

## Automation Sketch (Chipmunk + Workers)

| Skill shape | Worker | Trigger |
|-------------|--------|---------|
| `ingest-failure` | Source (Evidence) | Test miss or harness failure comment |
| `inspect-token` | Source / Harness | Dump top-k logits at index `t`; record why-chosen |
| `fork-routes` | Harness (Test) | From prefix, sample vines for chosen vs corrected (vs other alts) |
| `clean-dataset` | Data (Datasets) | Raw corpus or Evidence dump → filtered shard + QC report |
| `rows-from-evidence` | Data (Datasets) | Evidence batch → SFT / preference / transition / SPIN pairs |
| `rows-from-forks` | Data (Datasets) | Token-edit / vine-score records → TDPO / VinePPO / edit-SFT rows |
| `reject-sample` | Data (Datasets) | Generate N, keep verifier-passers as SFT rows |
| `dry-run-train` | Training (Tune) | Validate recipe, deps, VRAM, token budget |
| `train-recipe` | Training (Tune) | `unsloth-sft`, `unsloth-dpo`, `unsloth-grpo`, `token-dpo`, `vine-ppo`, `ppo-env`, `cpt`, `spin` |
| `eval-harness` | Harness (Test) | Post-train eval; write report artifact |
| `close-the-loop` | Chipmunk | Chain miss → Evidence → clean/rows → Tune → Test |

Keep skills thin: they call existing `/api/*` surfaces and write under
`~/.brain-spa`. Prefer recipe YAML inspired by Unsloth/Axolotl/TRL/NeMo RL
flags over a new configuration language.

## What Not To Do

- Do not make the product about one adapter, one bot, or one chess/Snake demo.
- Do not commit weights, rollouts, or eval screenshots.
- Do not replace the four-stage loop with a mega training dashboard.
- Do not vendor Megatron / NeMo RL / Curator as required runtime deps for the
  public shell; borrow patterns and optional worker backends instead.
- Do not copy corporate “platform” copy; keep docs mechanical and artifact-named.

## Related Docs

- [ml-platform.md](ml-platform.md) — Studio algorithms and current OSS lineage
- [loop-pipeline-and-feedback.md](loop-pipeline-and-feedback.md) — feedback rule
- [environment-harness-spec.md](environment-harness-spec.md) — harness contract
- [custom-harnesses.md](custom-harnesses.md) — adding environments
- [ml-model-types.md](ml-model-types.md) — policy vs supervised model types
