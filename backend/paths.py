"""
CWD-independent data/model path resolution for the Python ML backend.

The pipeline stores pickled models, SQLite registries and training caches under
backend/data/. Code that used CWD-relative `Path("data")` silently broke when
the server was launched from the project root instead of the backend folder
(models_loaded=0, "No models available for inference"). Anchoring to this file
keeps every path correct no matter where `python backend/main.py` is invoked.
"""
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
DATA_DIR = BACKEND_DIR / "data"
MODELS_DIR = DATA_DIR / "models"


def ensure_data_dirs() -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_DIR


def resolve_data_path(path: str | Path) -> Path:
    """Anchor a CWD-relative data path to backend/data; leave absolute paths alone."""
    p = Path(path)
    if p.is_absolute() or str(p).startswith(".."):
        return p
    return DATA_DIR / p
