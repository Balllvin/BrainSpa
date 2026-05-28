from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path


def transcribe_audio_bytes(data: bytes, suffix: str = ".webm") -> tuple[str, list[str]]:
    """Transcribe audio with faster-whisper when installed; notes describe fallbacks."""
    notes: list[str] = []
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
        path = Path(handle.name)
        handle.write(data)

    try:
        text = _transcribe_with_faster_whisper(path, notes)
        if text:
            return text, notes
        text = _transcribe_with_cli(path, notes)
        if text:
            return text, notes
        raise RuntimeError(
            "No local STT available. Install faster-whisper: pip install faster-whisper"
        )
    finally:
        path.unlink(missing_ok=True)


def _transcribe_with_faster_whisper(path: Path, notes: list[str]) -> str | None:
    try:
        from faster_whisper import WhisperModel  # type: ignore import-not-found
    except ImportError:
        notes.append("faster-whisper Python package not installed")
        return None

    model_name = "base"
    notes.append(f"transcribed with faster-whisper ({model_name})")
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, _info = model.transcribe(str(path), beam_size=1, vad_filter=True)
    parts = [segment.text.strip() for segment in segments if segment.text.strip()]
    return " ".join(parts).strip() or None


def _transcribe_with_cli(path: Path, notes: list[str]) -> str | None:
    binary = shutil.which("faster-whisper") or shutil.which("whisper")
    if not binary:
        notes.append("no faster-whisper or whisper CLI on PATH")
        return None

    output_dir = path.parent
    try:
        subprocess.run(
            [binary, str(path), "--output_dir", str(output_dir), "--output_format", "txt"],
            check=True,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except (OSError, subprocess.SubprocessError) as error:
        notes.append(f"CLI transcription failed: {error}")
        return None

    txt_path = output_dir / f"{path.stem}.txt"
    if not txt_path.exists():
        notes.append("CLI finished but transcript file missing")
        return None

    notes.append(f"transcribed with CLI ({binary})")
    return txt_path.read_text(encoding="utf-8").strip() or None
