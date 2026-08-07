# OSS Tune Backends

Local and reference backends for Brain Spa Tune. Prefer Unsloth on one GPU.
Treat NVIDIA and cluster stacks as recipe references, not shell dependencies.

Index: [training-methods.md](training-methods.md).

## Unsloth

Canonical local LLM Tune engine when Brain Spa grows past compact Studio Torch jobs.

https://github.com/unslothai/unsloth  
TRL integration: https://huggingface.co/docs/trl/en/unsloth_integration  
RL guide: https://unsloth.ai/docs/get-started/reinforcement-learning-rl-guide

### What it is

Hand-written Triton kernels + manual backprop path on top of HF Transformers /
PEFT / TRL. Claims ~2× speed and ~70–80% less VRAM vs stock setups; RL path
claims ~80% less VRAM for GRPO and ~7× longer context via batching. Supports
SFT, full FT, LoRA, QLoRA, 8-bit, pretrain/CPT, DPO, GRPO, GSPO, vision RL, FP8
RL. Export to HF, llama.cpp, Ollama, vLLM.

### Why it fits Brain Spa

- Adapter artifacts match Tune’s local model story
- Single-GPU / Colab-class machines match self-host
- TRL trainers keep recipe flags familiar
- vLLM weight-sharing cuts double-load VRAM for GRPO rollouts
- Chat-template + max-seq dry-runs map to Chipmunk `dry-run-train`

### Practical knobs

| Knob | Notes |
|------|-------|
| `load_in_4bit` | QLoRA default; disable for 16-bit LoRA |
| `full_finetuning` / `load_in_8bit` | Mutually exclusive with 4-bit |
| `max_seq_length` | Start short (e.g. 2048) for dry-run; Unsloth advertises long-context packing |
| LoRA `r` / `lora_alpha` / `target_modules` | Common: q/k/v/o + MLP projections; `lora_dropout=0`, `bias="none"` optimized |
| GRPO `num_generations` | Group size (often 8); drives VRAM with context length |
| GSPO | Set sequence-level importance sampling in GRPOConfig (`importance_sampling_level = "sequence"`) |
| `use_vllm` / fast inference | Rollout throughput; share GPU memory with train |

### VRAM rules of thumb (from Unsloth docs / reports)

- QLoRA GRPO: rough floor ≈ model parameter count in GB (safer bound), plus context × generations
- Example cited: Llama 3.1 8B, 20K context, 8 gens → ~54 GB Unsloth vs ~510 GB stock+FA2
- ≤1.5B reasoning GRPO: claimed workable near ~5 GB
- LoRA 16-bit: often ≥4× QLoRA VRAM
- Long CoT GRPO is usually rollout-bound; vLLM matters more than optimizer tricks

Treat numbers as orientation, not guarantees — re-measure on the target GPU in
`dry-run-train`.

### When to use vs skip

| Use Unsloth | Prefer something else |
|-------------|------------------------|
| Single/dual GPU local Tune | Multi-node Megatron-scale (NeMo RL / Megatron) |
| SFT / DPO / GRPO / GSPO adapters | Classic env RL in Studio (CleanRL path) |
| Fast iterate + export to llama.cpp / Ollama | Pure research on new loss with no Unsloth support yet → plain TRL |

### Pitfalls

- Wrong chat template silently poisons SFT and preference rows
- Packing + truncation can hide multiturn boundaries
- GRPO without a real reward/verifier collapses to noise
- Don’t store merged 16-bit weights in git; adapters under `~/.brain-spa` only

### Brain Spa recipes

`train-recipe: unsloth-sft | unsloth-dpo | unsloth-grpo | unsloth-gspo | unsloth-cpt`  
Dry-run checks: VRAM estimate, template hash, base model pin, max seq, output path
`~/.brain-spa/artifacts/training/<run>/`.

---

## NVIDIA {#nvidia}

Orgs: `NVIDIA`, `NVIDIA-NeMo`. Study recipes and contracts; do not require these
as public-shell runtime deps. See [public-shell-boundary.md](public-shell-boundary.md).

### Training and alignment

| Repo | Role | Link |
|------|------|------|
| Megatron-LM / Core | TP/PP/DP/EP, MoE, FP8 building blocks | https://github.com/NVIDIA/Megatron-LM |
| NeMo | Framework recipes around Megatron | https://github.com/NVIDIA/NeMo |
| Megatron-Bridge | HF ↔ Megatron checkpoints + recipes | https://github.com/NVIDIA-NeMo/Megatron-Bridge |
| **NeMo RL** | Current post-train library (Aligner successor): GRPO, PPO, SFT, DPO, RM, on-policy distillation, MOPD; Ray + Megatron/DTensor + vLLM | https://github.com/NVIDIA-NeMo/RL |
| NeMo-Aligner | Legacy SteerLM / DPO / RLHF; prefer NeMo RL | https://github.com/NVIDIA/NeMo-Aligner |
| **NeMo Gym** | Env + eval infra; GRPO tutorials with NeMo RL, Unsloth, verl | https://github.com/NVIDIA-NeMo/Gym |
| Nemotron | Open model / data / curation recipes | https://github.com/NVIDIA-NeMo/Nemotron |

**Borrow:** recipe YAML shape; async rollout workers ≠ train workers; Gym env
catalog + train/eval entrypoints (map to Brain Spa harness, don’t copy UI).

**Skip for shell:** shipping Megatron/NeMo as required installs.

### Data curation

| Repo | Role | Link |
|------|------|------|
| **NeMo Curator** | GPU text/image/video/audio: clean, LID, quality, PII, exact/fuzzy/semantic dedup | https://github.com/NVIDIA-NeMo/Curator |

CPU-first subset for Brain Spa: length, repetition, language ID, exact hash.
Fuzzy/semantic stay optional GPU paths. Details: [datasets-cleaning.md](datasets-cleaning.md).

### Inference and quantization

| Repo | Role | Link |
|------|------|------|
| TensorRT-LLM | High-throughput inference | https://github.com/NVIDIA/TensorRT-LLM |
| ModelOpt | Quantization, QAT, sparsity; NeMo RL FP8/NVFP4 paths | https://github.com/NVIDIA/Model-Optimizer |

---

## Inference And Rollout Workers

Token inspect and GRPO both need fast generate + logprobs.

| System | Role | Link |
|--------|------|------|
| **vLLM** | Batched rollouts, logprobs/top-k, GRPO workhorse | https://github.com/vllm-project/vllm |
| **SGLang** | Radix attention, structured decode; verl backend | https://github.com/sgl-project/sglang |
| FlashAttention | Attention kernel baseline under many trainers | https://github.com/Dao-AILab/flash-attention |
| bitsandbytes | 4/8-bit quant used with QLoRA stacks | https://github.com/bitsandbytes-foundation/bitsandbytes |
| llama.cpp | Local GGUF Test/deploy after Tune | https://github.com/ggml-org/llama.cpp |
| Ollama | Convenience runner for exported models | https://ollama.com |

### Brain Spa angles

- Test / token-fork viewer: request `top_k` / `logprobs` per step; store compact
  top-k only (not full vocab) in Evidence
- Tune GRPO: Unsloth+vLLM colocated, or separate rollout worker later
- Structured harness actions: SGLang / XGrammar-style guided decode when tools
  need valid JSON/action tags
- Export path after Tune: adapter → (optional merge) → HF or GGUF for Test

### Related trainers (cluster / research)

| Repo | Notes | Link |
|------|-------|------|
| TRL | HF trainers Unsloth wraps | https://github.com/huggingface/trl |
| Axolotl | YAML recipes | https://github.com/axolotl-ai-cloud/axolotl |
| LLaMA-Factory | Broad UI/CLI coverage | https://github.com/hiyouga/LLaMA-Factory |
| PEFT | LoRA library | https://github.com/huggingface/peft |
| verl | FSDP/Megatron + vLLM/SGLang | https://github.com/verl-project/verl |
| OpenRLHF | Ray + vLLM RLHF/RLVR | https://github.com/OpenRLHF/OpenRLHF |

RL algorithm detail: [rl-post-training.md](rl-post-training.md).

## Related

- [training-methods.md](training-methods.md)
- [rl-post-training.md](rl-post-training.md)
- [token-level-credit.md](token-level-credit.md)
- [ml-platform.md](ml-platform.md)
