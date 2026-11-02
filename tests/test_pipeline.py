"""
Backward-compatible test runner shim delegating to sentiment_module/tests/test_pipeline.py.
"""

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
SENTIMENT_MODULE_DIR = ROOT_DIR / "sentiment_module"
for p in [ROOT_DIR, SENTIMENT_MODULE_DIR]:
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from sentiment_module.tests.test_pipeline import *
