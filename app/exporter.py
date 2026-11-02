import sys
from pathlib import Path

_sentiment_module_dir = Path(__file__).resolve().parent.parent / "sentiment_module"
if str(_sentiment_module_dir) not in sys.path:
    sys.path.insert(0, str(_sentiment_module_dir))

from sentiment_module.app.exporter import *
