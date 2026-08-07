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
| Single/dual NVIDIA GPU local Tune | Apple Silicon → [MLX](#mlx) |
| SFT / DPO / GRPO / GSPO adapters | Classic env RL in Studio (CleanRL path) |
| Fast iterate + export to llama.cpp / Ollama | Multi-node Megatron-scale (NeMo RL / Megatron) |
|  | Pure research on new loss with no Unsloth support yet → plain TRL |

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

## MLX {#mlx}

Apple Silicon path for **inference and Tune** when the machine is a Mac (unified
memory / Metal). Complements Unsloth (CUDA/NVIDIA); do not treat MLX as a CUDA
replacement on Linux GPUs.

### Core repos

| Repo | Role | Link |
|------|------|------|
| **MLX** | Array framework for Apple silicon (NumPy-like; Python / C++ / C / Swift) | https://github.com/ml-explore/mlx |
| **mlx-lm** | LLM generate, quantize, LoRA/QLoRA/full FT, HF Hub, distributed `mx.distributed` | https://github.com/ml-explore/mlx-lm |
| mlx-examples | Reference examples (LLaMA, LoRA, Whisper, SD, …) | https://github.com/ml-explore/mlx-examples |
| mlx-swift | Swift API for MLX | https://github.com/ml-explore/mlx-swift |
| **mlx-swift-lm** | Native Swift LLM/VLM load, generate, fine-tune for macOS/iOS apps | https://github.com/ml-explore/mlx-swift-lm |
| **mlx-vlm** | Vision-language infer + fine-tune on MLX | https://github.com/Blaizzy/mlx-vlm |
| MLX Community (HF) | Thousands of pre-converted / quantized MLX weights | https://huggingface.co/mlx-community |

Docs hub: https://ml-explore.github.io/mlx/  
LoRA guide (in-repo): https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/LORA.md

### What mlx-lm gives you

- CLI / Python generate and chat (`mlx_lm.generate`, streaming)
- Convert + quantize HF models (`mlx_lm.convert -q`) and upload to Hub
- LoRA / DoRA / full fine-tune on quantized bases (`mlx_lm.lora`)
- Fuse adapters back into a standalone MLX model for Test
- Prompt cache, batch generate, per-token logprobs (needed for token forks)
- Optional multi-device via `mx.distributed`

Default community model often used in docs: `mlx-community/Llama-3.2-3B-Instruct-4bit`.

### Preference and RL on MLX

| Project | Role | Link |
|---------|------|------|
| mlx-lm tuner (upstream) | SFT + DPO offline; GRPO trainer landing in mlx-lm | https://github.com/ml-explore/mlx-lm · [GRPO PR](https://github.com/ml-explore/mlx-lm/pull/1421) |
| **mlx-lm-lora** | Extended PEFT trainers: SFT, DPO, ORPO, KTO, SimPO, GRPO-style | https://github.com/Goekdeniz-Guelmez/mlx-lm-lora |
| **mlx-tune** | Unsloth-shaped API on MLX (SFT / DPO / GRPO / KTO / SimPO / ORPO / CPT) | https://github.com/arahim3/mlx-tune |
| **MLX-GRPO** | Pure-MLX GRPO + CoT rewards (e.g. GSM8K) | https://github.com/Doriandarko/MLX-GRPO |

GRPO on MLX mirrors the CUDA story: group completions → reward_fn → group
advantages → LoRA update. Wire Brain Spa harness scores the same way as
Unsloth/TRL (`reward_fn(completions, prompt) -> scores`).

### Inference placement (Apple Silicon)

| Need | Prefer |
|------|--------|
| Experiment / custom loop / logprobs / vines | **mlx-lm** Python |
| Ship a Mac/iOS app with pinned local model | **mlx-swift-lm** |
| Packaged multi-model server on Mac | llama.cpp Metal, Ollama, or a localhost MLX HTTP wrapper |
| Vision + language | **mlx-vlm** |
| Already have GGUF only | llama.cpp Metal / Ollama (still fine; convert to MLX when you need LoRA) |

Large models vs RAM: mlx-lm notes slowness when the model is large vs total
unified memory; macOS 15+ can wire model/cache memory — raise
`iogpu.wired_limit_mb` when the model fits RAM but needs wired headroom.

### Why it fits Brain Spa

- Many self-host users are on Macs; CUDA Unsloth won’t run there
- Adapter artifacts still local under `~/.brain-spa`
- Generate + top-k / logprobs feed [token-level-credit.md](token-level-credit.md)
- Same loop: Evidence → Datasets → `mlx-sft` / `mlx-grpo` → Test via mlx-lm
- Export story: MLX adapter → fuse → Test; or convert paths toward GGUF when needed

### When to use vs Unsloth / vLLM

| Use MLX | Use Unsloth + vLLM / CUDA |
|---------|---------------------------|
| Apple Silicon Mac for Tune + Test | NVIDIA GPU Linux / Windows |
| mlx-community 4-bit LoRA iterate | Max CUDA GRPO throughput, NeMo/verl scale |
| Swift desktop/iOS Test shell later | Cluster Ray / FSDP / Megatron |

### Pitfalls

- MLX weights ≠ HF/CUDA checkpoints — pin format in dry-run (`mlx` vs `hf` vs `gguf`)
- Quantized 4-bit → GGUF export is limited; fuse/export rules differ from Unsloth
- Don’t assume TRL scripts run unmodified; use mlx-lm / mlx-tune / mlx-lm-lora
- Unified memory thrash looks like “slow GPU” — watch RAM pressure
- GRPO still needs a real verifier; Metal doesn’t fix sparse rewards

### Brain Spa recipes

`train-recipe: mlx-sft | mlx-dpo | mlx-grpo | mlx-cpt`  
`infer-backend: mlx-lm` for Test / `inspect-token` / `fork-routes` on Mac  
Dry-run: model id (prefer `mlx-community/…`), adapter path, RAM estimate, template.

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
| **MLX / mlx-lm** | Apple Silicon generate, quantize, logprobs, LoRA serve | https://github.com/ml-explore/mlx-lm |
| **mlx-vlm** | Apple Silicon vision-language infer | https://github.com/Blaizzy/mlx-vlm |
| **vLLM** | CUDA batched rollouts, logprobs/top-k, GRPO workhorse | https://github.com/vllm-project/vllm |
| **SGLang** | Radix attention, structured decode; verl backend | https://github.com/sgl-project/sglang |
| FlashAttention | Attention kernel baseline under many CUDA trainers | https://github.com/Dao-AILab/flash-attention |
| bitsandbytes | 4/8-bit quant used with QLoRA stacks | https://github.com/bitsandbytes-foundation/bitsandbytes |
| llama.cpp | Local GGUF Test/deploy (Metal on Mac, CUDA/CPU elsewhere) | https://github.com/ggml-org/llama.cpp |
| Ollama | Convenience runner for exported models | https://ollama.com |

### Brain Spa angles

- Test / token-fork viewer: request `top_k` / `logprobs` per step; store compact
  top-k only (not full vocab) in Evidence — mlx-lm on Mac, vLLM/SGLang on CUDA
- Tune GRPO: Unsloth+vLLM (CUDA) or mlx-lm / mlx-tune / MLX-GRPO (Apple Silicon)
- Structured harness actions: SGLang / XGrammar-style guided decode when tools
  need valid JSON/action tags
- Export path after Tune: adapter → (optional merge/fuse) → HF, MLX, or GGUF for Test
- Pick **one** primary infer backend per machine in Settings; don’t mix CUDA and
  MLX in the same worker process

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
