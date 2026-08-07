# Datasets Cleaning And Curation

Quality of Datasets dominates Tune. Cleaning is a Datasets stage, not a
one-off script.

Index: [training-methods.md](training-methods.md).

## Pipeline stages

Run in order; write a QC report after each enabled stage.

| Stage | What | Local-first? |
|-------|------|--------------|
| Ingest | Load JSONL/CSV/WARC; normalize schema | Yes |
| Language ID | Keep target language(s); route the rest | Yes (FastText LID / simple heuristics) |
| Heuristic quality | Length, repetition, URL ratio, boilerplate, symbol ratio | Yes |
| Exact dedup | Hash document or paragraph (MD5/SHA) | Yes |
| Fuzzy dedup | MinHash + LSH near-duplicates | Optional GPU (Curator) or CPU Datatrove |
| Semantic dedup | Embedding similarity clusters | Optional GPU |
| Privacy / safety | PII scrub, toxicity / NSFW filters | Start with regex/PII tools; scale with Curator |
| Domain / quality classifier | FineWeb-Edu-style “educational” or in-domain keep | Optional classifier |
| Preference scrub | Drop ties, swap chosen/rejected via judge, length filters | Yes (distilabel / Argilla) |
| Rejection sample | Generate N, keep verifier-passers | Yes if verifier exists |

## Tooling

| Tool | Strength | Link |
|------|----------|------|
| **Datatrove** | Large-scale web pipelines; FineWeb processing | https://github.com/huggingface/datatrove |
| **FineWeb / FineWeb-Edu** | Cleaned CommonCrawl + educational quality scoring | https://huggingface.co/datasets/HuggingFaceFW/fineweb |
| **Dolma** | AllenAI corpus toolkit + recipes | https://github.com/allenai/dolma |
| **NeMo Curator** | GPU text/image/video/audio curation; exact/fuzzy/semantic dedup, PII, classifiers | https://github.com/NVIDIA-NeMo/Curator |
| **distilabel** | Synthetic generation + AI feedback / UltraFeedback-style judges | https://github.com/argilla-io/distilabel |
| **Argilla** | Human/AI review UI for labels and preferences | https://github.com/argilla-io/argilla |
| HF Datasets | Loaders + streaming | https://github.com/huggingface/datasets |

NVIDIA Curator detail also under [oss-tune-backends.md](oss-tune-backends.md#nvidia).

## Dedup mechanics (borrow, don’t cargo-cult)

| Kind | Mechanism | Watch for |
|------|-----------|-----------|
| Exact | Hash normalized text | Whitespace/unicode normalization must be stable |
| Fuzzy | MinHash signatures + LSH buckets; Jaccard threshold | Threshold too low deletes paraphrases you need |
| Semantic | Embed → cluster → keep centroid / best quality | Embedding domain mismatch; GPU cost |

For Brain Spa local corpora (Evidence dumps, harness traces, small domain
scrapes): **exact + heuristics first**. Add fuzzy when duplicates show up in
QC samples.

## Preference and SFT scrub

- Assume “GPT is always chosen” is false — re-judge or score (distilabel lesson
  on Orca DPO pairs)
- Drop ties; keep rating columns for later filters
- Length-filter extremes that teach verbosity
- Multiturn: preference usually on the **last** assistant turn; keep history
- SPIN-style rows: human target vs model’s older sample — see catalog preference
  section

## QC report artifact

Every `clean-dataset` run should write something like:

```json
{
  "pipeline": ["lid", "heuristics", "exact_dedup"],
  "input_count": 10000,
  "kept": 7200,
  "dropped": {
    "lid": 800,
    "heuristics": 1500,
    "exact_dedup": 500
  },
  "config_hash": "...",
  "sample_rejects_path": "rejects.jsonl"
}
```

Store under `~/.brain-spa/artifacts/datasets/<id>/`. Never commit corpora.

## Synthetic data

| Goal | Pattern |
|------|---------|
| SFT rows | Prompt → strong model completion → filter |
| Preference pairs | Two completions → judge / PairRM → chosen/rejected |
| Reasoning SFT | Distilled traces (Open-R1 Mixture-of-Thoughts, OpenThoughts) |
| PRM / step labels | Auto vine-to-answer labels (Math-Shepherd idea) or PRM800K |

Open-R1 / OpenThoughts: [rl-post-training.md](rl-post-training.md).

## Chipmunk skill

`clean-dataset`: configurable stage list → new dataset id + QC report.  
`rows-from-evidence` / `reject-sample`: after clean, type rows for Tune.

## Pitfalls

- Over-dedup wipes rare domain Evidence
- LID false drops on code or mixed language
- Cleaning Test prompts into Tune data (leakage)
- No reject samples → you can’t debug the filter
- GPU Curator as a hard dependency for the public shell

## Related

- [training-method-catalog.md](training-method-catalog.md)
- [oss-tune-backends.md](oss-tune-backends.md)
- [loop-pipeline-and-feedback.md](loop-pipeline-and-feedback.md)
- [token-level-credit.md](token-level-credit.md)
