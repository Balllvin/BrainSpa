# Training Method Catalog

Method and repo tables. Deep dives live elsewhere — this file is the map.

Index: [training-methods.md](training-methods.md).

## Pretraining {#pretraining}

| Method | Idea | Default borrow |
|--------|------|----------------|
| From-scratch | Next-token LM on cleaned corpora | nanoGPT / LitGPT Studio path |
| CPT | Continue base model on domain text | Unsloth CPT after [datasets-cleaning.md](datasets-cleaning.md) |
| MoE / distributed | TP/PP/EP at scale | Study Megatron/NeMo only |

| Repo | Link |
|------|------|
| nanoGPT | https://github.com/karpathy/nanoGPT |
| LitGPT | https://github.com/Lightning-AI/litgpt |
| TinyLlama | https://github.com/jzhang38/TinyLlama |
| Unsloth | https://github.com/unslothai/unsloth |
| mlx-lm / mlx-tune (CPT on Apple Silicon) | https://github.com/ml-explore/mlx-lm · https://github.com/arahim3/mlx-tune |
| Megatron-LM | https://github.com/NVIDIA/Megatron-LM |
| NeMo | https://github.com/NVIDIA/NeMo |
| Nanotron | https://github.com/huggingface/nanotron |
| LLM360 | https://github.com/LLM360 |
| DeepSpeed | https://github.com/microsoft/DeepSpeed |
| Datatrove / FineWeb | https://github.com/huggingface/datatrove · https://huggingface.co/datasets/HuggingFaceFW/fineweb |

Backends: [oss-tune-backends.md](oss-tune-backends.md).

## SFT

| Method | Idea |
|--------|------|
| Full SFT | Update all weights on instruction rows |
| LoRA / QLoRA | Adapter Tune (Brain Spa default lean) |
| Packing | Concat short samples for throughput |

| Repo | Link |
|------|------|
| Unsloth | https://github.com/unslothai/unsloth |
| **MLX / mlx-lm** | https://github.com/ml-explore/mlx · https://github.com/ml-explore/mlx-lm |
| mlx-tune / mlx-lm-lora | https://github.com/arahim3/mlx-tune · https://github.com/Goekdeniz-Guelmez/mlx-lm-lora |
| TRL `SFTTrainer` | https://github.com/huggingface/trl |
| Axolotl | https://github.com/axolotl-ai-cloud/axolotl |
| LLaMA-Factory | https://github.com/hiyouga/LLaMA-Factory |
| PEFT | https://github.com/huggingface/peft |
| OpenRLHF SFT | https://github.com/OpenRLHF/OpenRLHF |
| NeMo RL SFT | https://github.com/NVIDIA-NeMo/RL |
| Open-Instruct / Tulu | https://github.com/allenai/open-instruct |
| bitsandbytes | https://github.com/bitsandbytes-foundation/bitsandbytes |

## Preference And Alignment {#preference-and-alignment}

Pair data unless noted.

| Method | Idea |
|--------|------|
| DPO | Preference loss vs reference policy |
| IPO | DPO variant; identity preference |
| ORPO | SFT + preference in one odds-ratio stage |
| KTO | Desirable / undesirable labels (no pairs) |
| SimPO / CPO | Reference-free / alt preference losses |
| RM / PRM | Score responses or steps |
| SPIN | Self-play: human SFT target vs older self (SFT data only) |

| Repo | Link |
|------|------|
| Unsloth | https://github.com/unslothai/unsloth |
| TRL DPO/KTO | https://github.com/huggingface/trl |
| mlx-lm / mlx-tune / mlx-lm-lora | https://github.com/ml-explore/mlx-lm · https://github.com/arahim3/mlx-tune · https://github.com/Goekdeniz-Guelmez/mlx-lm-lora |
| Axolotl RLHF | https://docs.axolotl.ai/docs/rlhf.html |
| OpenRLHF | https://github.com/OpenRLHF/OpenRLHF |
| SPIN | https://github.com/uclaml/SPIN |
| NeMo RL | https://github.com/NVIDIA-NeMo/RL |
| distilabel / Argilla | https://github.com/argilla-io/distilabel · https://github.com/argilla-io/argilla |
| TDPO | https://github.com/vance0124/Token-level-Direct-Preference-Optimization |

Token edits: [token-level-credit.md](token-level-credit.md). Cleaning: [datasets-cleaning.md](datasets-cleaning.md).

## RL Post-Training (LLM)

Deep dive: [rl-post-training.md](rl-post-training.md).

| Method | Idea |
|--------|------|
| PPO | Actor + critic + reward |
| GRPO | Group-relative advantages; no critic |
| GSPO | Sequence-level IS + clip |
| Hierarchical GRPO | Role- and problem-aware comparison sets (multi-agent) |
| RAE | Role-conditioned advantage baselines |
| RLOO | Leave-one-out baseline |
| DAPO / Dr.GRPO / … | Long-CoT stability knobs |
| RLVR | Verifier rewards |
| VinePPO | MC vines for credit |
| Agentic RL | Multi-turn env/tool rollouts |
| Multi-agent Env | Judge / self-play / user-sim programmed over Agents |
| MOPD / on-policy distill | Teacher token advantages |

| Repo | Link |
|------|------|
| Unsloth | https://github.com/unslothai/unsloth |
| mlx-lm / mlx-tune / MLX-GRPO | https://github.com/ml-explore/mlx-lm · https://github.com/arahim3/mlx-tune · https://github.com/Doriandarko/MLX-GRPO |
| TRL GRPO | https://github.com/huggingface/trl |
| Open-R1 | https://github.com/huggingface/open-r1 |
| OpenThoughts | https://github.com/open-thoughts/open-thoughts |
| **prime-rl / verifiers** | https://github.com/PrimeIntellect-ai/prime-rl · https://github.com/PrimeIntellect-ai/verifiers |
| NeMo RL | https://github.com/NVIDIA-NeMo/RL |
| verl | https://github.com/verl-project/verl |
| OpenRLHF | https://github.com/OpenRLHF/OpenRLHF |
| AReaL | https://github.com/areal-project/AReaL |
| SkyRL | https://github.com/NovaSky-AI/SkyRL |
| ROLL | https://github.com/alibaba/ROLL |
| VinePPO | https://github.com/McGill-NLP/VinePPO |
| tiny-grpo / mini-grpo | https://github.com/open-thought/tiny-grpo · https://github.com/JialiangFan/mini-grpo |
| vLLM / SGLang | https://github.com/vllm-project/vllm · https://github.com/sgl-project/sglang |
| llama.cpp (Metal/CUDA) | https://github.com/ggml-org/llama.cpp |

## Classic RL (Studio)

Already in [ml-platform.md](ml-platform.md). Do not conflate with LLM post-train.

| Family | Link |
|--------|------|
| CleanRL | https://github.com/vwxyzjn/cleanrl |
| Spinning Up | https://spinningup.openai.com |
| Gymnasium | https://github.com/Farama-Foundation/Gymnasium |
| PettingZoo | https://github.com/Farama-Foundation/PettingZoo |
| OpenSpiel | https://github.com/google-deepmind/open_spiel |
| ALE | https://github.com/Farama-Foundation/Arcade-Learning-Environment |
| Stable-Baselines3 | https://github.com/DLR-RM/stable-baselines3 |

## Agentic Environments {#agentic-environments}

Harness = world, tools, actions, scoring — [environment-harness-spec.md](environment-harness-spec.md).

Multi-agent Agent/Env patterns (judge, self-play, user-sim, Hierarchical GRPO):
[rl-post-training.md](rl-post-training.md#multi-agent-rl-prime-intellect).

| Repo | Link |
|------|------|
| OpenEnv | https://github.com/huggingface/OpenEnv · https://huggingface.co/openenv |
| NeMo Gym | https://github.com/NVIDIA-NeMo/Gym |
| **verifiers** (Prime Intellect) | https://github.com/PrimeIntellect-ai/verifiers |
| **prime-rl** | https://github.com/PrimeIntellect-ai/prime-rl |
| Prime Environments Hub | https://app.primeintellect.ai/dashboard/environments |
| BrowserGym | https://github.com/ServiceNow/BrowserGym |
| TextArena | https://github.com/TextArena/TextArena |
| SWE-bench | https://github.com/SWE-bench/SWE-bench |
| PettingZoo (classic multi-agent) | https://github.com/Farama-Foundation/PettingZoo |
## Data Cleaning

Deep dive: [datasets-cleaning.md](datasets-cleaning.md).

| Repo | Link |
|------|------|
| NeMo Curator | https://github.com/NVIDIA-NeMo/Curator |
| Datatrove | https://github.com/huggingface/datatrove |
| FineWeb | https://huggingface.co/datasets/HuggingFaceFW/fineweb |
| Dolma | https://github.com/allenai/dolma |
| distilabel | https://github.com/argilla-io/distilabel |
| Argilla | https://github.com/argilla-io/argilla |

## Evaluation {#evaluation}

| Repo | Link |
|------|------|
| lm-evaluation-harness | https://github.com/EleutherAI/lm-evaluation-harness |
| Inspect AI | https://github.com/UKGovernmentBEIS/inspect_ai |
| LightEval | https://github.com/huggingface/lighteval |
| NeMo Gym | https://github.com/NVIDIA-NeMo/Gym |
| HELM | https://github.com/stanford-crfm/helm |
| PRM800K (process eval data) | https://github.com/openai/prm800k |

Post-Tune: `eval-harness` → report → fails to Evidence.

## Emerging (maturity gate)

| Mature enough to wire first | Promising | Research / later |
|-----------------------------|-----------|------------------|
| Unsloth SFT/DPO/GRPO, mlx-lm infer+LoRA, TRL, Open-R1 recipes | verifiers+prime-rl multi-agent (judge/self-play/user-sim), Hierarchical GRPO/RAE, mlx-tune GRPO/DPO, GSPO, VinePPO vines in Test UI, ORPO/KTO/SimPO, PRMs | TreePO, TP-GRPO, MOPD, full counterfactual SCMs, Megatron-scale CPT |

Novelty without a Chipmunk skill + artifact type stays a bookmark.

## Related

- [training-methods.md](training-methods.md)
- [oss-tune-backends.md](oss-tune-backends.md)
- [rl-post-training.md](rl-post-training.md)
- [token-level-credit.md](token-level-credit.md)
- [datasets-cleaning.md](datasets-cleaning.md)
- [ml-platform.md](ml-platform.md)
