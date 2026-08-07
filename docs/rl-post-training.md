# RL Post-Training

Online RL for language and agents after SFT. Pair with
[oss-tune-backends.md](oss-tune-backends.md) (Unsloth / vLLM) and
[token-level-credit.md](token-level-credit.md) (dense credit).

Index: [training-methods.md](training-methods.md).

## Why this stage exists

SFT teaches format. Preference methods teach “A over B.” RL teaches from a
**reward** while the model acts — math checkers, unit tests, harness scores,
or a reward model. Brain Spa’s Test scorers are natural reward functions.

## Algorithm map

| Method | Core idea | Critic? | Typical use |
|--------|-----------|---------|-------------|
| **PPO** | Clipped policy gradient + value baseline + optional KL to ref | Yes (value net) | Classic RLHF; heavy VRAM |
| **GRPO** | Sample a group of answers per prompt; advantage = (r − mean) / std within group | No | Reasoning / RLVR (DeepSeek-R1 style) |
| **GSPO** | Sequence-level importance ratio + clip (vs token-level GRPO) | No | More stable long traces / MoE (Qwen) |
| **RLOO** | REINFORCE with leave-one-out baseline across samples | No | Simple variance reduction |
| **DAPO / Dr.GRPO / …** | Dynamic sampling, asymmetric clip, norm variants | Usually no | Long CoT stability knobs |
| **RLVR** | Reward from verifiers (exact match, code exec, proofs) | Optional | Harness-aligned training |
| **VinePPO** | PPO with MC vines instead of value net | MC rollouts | Dense credit at prefixes — see token doc |

### GRPO (detail)

For each prompt, sample G completions. Score each. Advantage for completion i:

`A_i = (r_i − mean(r)) / (std(r) + ε)`

Update with a clipped PPO-style surrogate on token logprobs, often with a KL
penalty toward a reference (SFT) policy. No critic weights → large memory win
vs PPO.

**Knobs that matter:** `num_generations` (G), max completion length, KL coeff,
temperature, reward scale, whether to mask padding / prompt tokens.

**Unsloth path:** LoRA/QLoRA GRPO + vLLM rollouts; GSPO via sequence-level IS
flag. See [oss-tune-backends.md](oss-tune-backends.md#unsloth).

**TRL path:** `GRPOTrainer` — accessible HF entry when not using Unsloth.
https://github.com/huggingface/trl

### GSPO (detail)

Token-level importance ratios in GRPO can explode on long sequences and MoE
routing noise. GSPO defines the ratio on the **full sequence likelihood**
(length-normalized) and clips per sequence. Claimed benefits: stabler MoE RL,
less need for routing-replay hacks, friendlier to train/infer likelihood
mismatch.

Paper: https://arxiv.org/abs/2507.18071 (Qwen team). Unsloth/AReaL expose
related config.

### PPO vs GRPO vs vines

| | PPO | GRPO/GSPO | VinePPO |
|-|-----|-----------|---------|
| Baseline | Learned V(s) | Group of full answers | MC continuations from prefix |
| Credit to steps | Via critic (often weak on long CoT) | Shared across tokens in a completion | Per-prefix unbiased estimate |
| Cost | Critic params | G rollouts per prompt | G train rollouts + K vines per state |
| Brain Spa default lean | Classic env Studio only | LLM Tune default | Token-fork / dense credit path |

## RLVR — verifiable rewards

Map Test harness scores to rewards. No human preference labels required.

| Verifier type | Example | Brain Spa hook |
|---------------|---------|----------------|
| Exact / numeric | MATH, GSM8K answer | Parse final answer, 0/1 |
| Code execution | unit tests, IOI/CF runners | Sandbox score → reward |
| Env score | Snake return, gridworld success | Existing env metrics |
| Structured valid | JSON / tool schema | Guided decode + validate |
| Composite | format reward + correctness | Weighted sum; log components |

**Open-R1** (HF): open reproduction path for R1-style pipelines — distilled
reasoning SFT (e.g. Mixture-of-Thoughts, OpenR1-Math-220k) then GRPO with
code/math rewards; built around TRL + vLLM/SGLang.
https://github.com/huggingface/open-r1

**OpenThoughts:** open reasoning datasets used alongside Open-R1.
https://github.com/open-thoughts/open-thoughts

**tiny-grpo / mini-grpo:** small readable GRPO refs for local learning.
https://github.com/open-thought/tiny-grpo · https://github.com/JialiangFan/mini-grpo

## Stack choice

| Scale / machine | Stack |
|-----------------|-------|
| Apple Silicon Mac | **mlx-lm** / mlx-tune / mlx-lm-lora / MLX-GRPO; Test via mlx-lm or llama.cpp Metal |
| 1× NVIDIA GPU | Unsloth + vLLM + TRL recipes |
| Multi-GPU single node | TRL / Axolotl + Accelerate/FSDP or DeepSpeed |
| Multi-node RLHF/RLVR | verl, OpenRLHF, NeMo RL |
| Env catalog + agent RL | NeMo Gym or OpenEnv + one of the above |
| Teach yourself GRPO | tiny-grpo / mini-grpo / Open-R1 / MLX-GRPO |

Also: AReaL (algorithm matrix), SkyRL, ROLL — research cousins; study, don’t
vendor. Links in [training-method-catalog.md](training-method-catalog.md).

MLX backend detail: [oss-tune-backends.md](oss-tune-backends.md#mlx).

## Reward design pitfalls

- Sparse 0/1 only → slow credit; add format rewards carefully (easy to hack)
- Reward model instead of verifier → sycophancy / length bias
- Unnormalized rewards across tasks → one task dominates
- Train/eval leakage (same MATH items in Tune and Test)
- Logging only mean reward — keep fail comments for Evidence

## Brain Spa automation

| Skill / recipe | Role |
|----------------|------|
| `train-recipe: unsloth-grpo` / `unsloth-gspo` / `mlx-grpo` | Local reasoning RL (CUDA vs Apple Silicon) |
| `train-recipe: grpo-trl` | Plain TRL path (CUDA) |
| `eval-harness` | Same verifiers as rewards, offline report |
| Harness score → reward fn | Shared scorer module for Test and Tune |

Feedback rule: misses become Evidence, then better rewards or datasets —
[loop-pipeline-and-feedback.md](loop-pipeline-and-feedback.md).

## Related

- [oss-tune-backends.md](oss-tune-backends.md)
- [token-level-credit.md](token-level-credit.md)
- [training-method-catalog.md](training-method-catalog.md)
- [ml-platform.md](ml-platform.md) — classic env RL (separate lane)
