#!/usr/bin/env python3
"""
Root CLI Batch Runner Wrapper.
Delegates execution to the canonical sentiment_module.cli_batch_runner.
"""

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
SENTIMENT_MODULE_DIR = ROOT_DIR / "sentiment_module"
if str(SENTIMENT_MODULE_DIR) not in sys.path:
    sys.path.insert(0, str(SENTIMENT_MODULE_DIR))
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from sentiment_module.cli_batch_runner import main

if __name__ == "__main__":
    main()
