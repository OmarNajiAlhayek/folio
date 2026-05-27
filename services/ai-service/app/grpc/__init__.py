"""gRPC server for internal Folio callers (Nest backend)."""

import sys
from pathlib import Path

_GEN_ROOT = Path(__file__).resolve().parent / "gen"
if _GEN_ROOT.is_dir() and str(_GEN_ROOT) not in sys.path:
    sys.path.insert(0, str(_GEN_ROOT))
