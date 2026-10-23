"""Natural offline speech: Piper neural voices run on the laptop; the robot tablet just plays the WAV.

Voice models are downloaded once from the public rhasspy/piper-voices repository. Spoken text never
leaves the laptop.
"""

from collections import OrderedDict
import io
import logging
import os
from pathlib import Path
import threading
from urllib import request
import wave

LOG = logging.getLogger("ct-companion.tts")
VOICES = {
    "en": os.environ.get("CT_VOICE_EN", "en_US-lessac-medium"),
    "de": os.environ.get("CT_VOICE_DE", "de_DE-thorsten-medium"),
}
BASE_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0"
VOICE_DIR = Path(os.environ.get("CT_VOICE_DIR", Path(__file__).resolve().parent / "voices"))
# Slightly slower than default: calmer for patients.
LENGTH_SCALE = float(os.environ.get("CT_VOICE_PACE", "1.08"))
CACHE_SIZE = 128


class TtsUnavailable(Exception):
    pass


_voices: dict[str, object] = {}
_cache: "OrderedDict[tuple[str, str], bytes]" = OrderedDict()
_load_lock = threading.Lock()
_synth_lock = threading.Lock()


def language_key(lang: str) -> str:
    return "de" if (lang or "").lower().startswith("de") else "en"


def _model_path(name: str) -> Path:
    return VOICE_DIR / f"{name}.onnx"


def _download(name: str) -> Path:
    model = _model_path(name)
    if model.exists() and model.with_suffix(".onnx.json").exists():
        return model
    locale = name.split("-")[0]
    speaker, quality = name.split("-")[1], name.split("-")[2]
    folder = f"{BASE_URL}/{locale.split('_')[0]}/{locale}/{speaker}/{quality}"
    VOICE_DIR.mkdir(parents=True, exist_ok=True)
    for suffix in (".onnx.json", ".onnx"):
        target = VOICE_DIR / f"{name}{suffix}"
        if target.exists():
            continue
        LOG.info("Downloading Piper voice %s%s", name, suffix)
        partial = target.with_name(target.name + ".part")
        with request.urlopen(f"{folder}/{name}{suffix}", timeout=120) as res, open(partial, "wb") as out:
            while chunk := res.read(1 << 20):
                out.write(chunk)
        partial.replace(target)
    return model


def voice(lang: str):
    key = language_key(lang)
    if key in _voices:
        return _voices[key]
    with _load_lock:
        if key not in _voices:
            try:
                from piper import PiperVoice
            except ImportError as exc:
                raise TtsUnavailable("piper-tts is not installed.") from exc
            try:
                _voices[key] = PiperVoice.load(str(_download(VOICES[key])))
            except Exception as exc:  # network, corrupt model, onnxruntime
                raise TtsUnavailable(f"Voice {VOICES[key]} unavailable: {exc}") from exc
    return _voices[key]


def synthesize(text: str, lang: str) -> bytes:
    text = " ".join(text.split())
    if not text:
        raise TtsUnavailable("Nothing to say.")
    key = (language_key(lang), text)
    with _synth_lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]
    engine = voice(lang)
    from piper import SynthesisConfig

    buffer = io.BytesIO()
    with _synth_lock:
        with wave.open(buffer, "wb") as wav:
            engine.synthesize_wav(text, wav, syn_config=SynthesisConfig(length_scale=LENGTH_SCALE))
        audio = buffer.getvalue()
        _cache[key] = audio
        while len(_cache) > CACHE_SIZE:
            _cache.popitem(last=False)
    return audio


def warm_up() -> None:
    """Download and load both voices in the background so the first spoken line is instant."""
    for lang in ("en", "de"):
        try:
            synthesize("Hello.", lang)
        except TtsUnavailable as exc:
            LOG.warning("Natural voice not ready (%s); pages fall back to device speech.", exc)


def status() -> dict:
    return {"engine": "piper", "voices": VOICES,
            "loaded": sorted(_voices), "downloaded": [k for k, n in VOICES.items() if _model_path(n).exists()]}
