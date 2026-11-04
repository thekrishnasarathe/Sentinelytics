#!/usr/bin/env python3
"""
Single-command Orchestrator for Social Media & E-Commerce Sentiment Analysis Platform (v2.0)
Starts both FastAPI backend (:8000) and Vite React frontend (:3000) concurrently.

Usage:
    python start.py
    python start.py --no-browser
    python start.py --backend-only
    python start.py --frontend-only
"""

import sys
import os
import time
import socket
import signal
import shutil
import argparse
import threading
import subprocess
import webbrowser
import urllib.request
from pathlib import Path

# ANSI colors for readable terminal logs
RESET = "\033[0m"
BOLD = "\033[1m"
GREEN = "\033[92m"
CYAN = "\033[96m"
YELLOW = "\033[93m"
RED = "\033[91m"
MAGENTA = "\033[95m"
BLUE = "\033[94m"

# Windows VT100 enable & UTF-8 output protection
if sys.platform == "win32":
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        import ctypes
        kernel32 = ctypes.windll.kernel32
        kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
    except Exception:
        pass


def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    """Check if a network port is already open/listening."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


def free_port(port: int):
    """Attempt to terminate any stale process holding a port."""
    try:
        if sys.platform == "win32":
            res = subprocess.run(
                f"netstat -ano | findstr :{port}",
                shell=True,
                capture_output=True,
                text=True
            )
            for line in res.stdout.strip().splitlines():
                parts = line.split()
                if len(parts) >= 5 and "LISTENING" in parts:
                    pid = parts[-1]
                    if pid != "0":
                        subprocess.run(f"taskkill /F /PID {pid}", shell=True, capture_output=True)
        else:
            subprocess.run(f"fuser -k {port}/tcp", shell=True, capture_output=True)
        time.sleep(0.5)
    except Exception:
        pass


def kill_process_tree(proc: subprocess.Popen):
    """Forcefully kill process and all spawned child processes."""
    if not proc or proc.poll() is not None:
        return
    try:
        if sys.platform == "win32":
            subprocess.run(
                f"taskkill /F /T /PID {proc.pid}",
                shell=True,
                capture_output=True
            )
        else:
            proc.terminate()
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                proc.kill()
    except Exception:
        pass


def stream_logs(pipe, prefix: str, color: str):
    """Streams stdout/stderr lines with colored service tags."""
    try:
        for line in iter(pipe.readline, ""):
            if not line:
                break
            clean_line = line.rstrip()
            if clean_line:
                print(f"{color}[{prefix}]{RESET} {clean_line}")
    except Exception:
        pass
    finally:
        try:
            pipe.close()
        except Exception:
            pass


def wait_for_health(url: str, timeout_sec: int = 25) -> bool:
    """Polls a URL until it responds with HTTP 200 or timeout expires."""
    start = time.time()
    while time.time() - start < timeout_sec:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "HealthCheck/1.0"})
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                if resp.status in (200, 304):
                    return True
        except Exception:
            pass
        time.sleep(0.4)
    return False


def get_npm_executable() -> str:
    """Locate npm executable across operating systems."""
    if sys.platform == "win32":
        return shutil.which("npm.cmd") or shutil.which("npm") or "npm.cmd"
    return shutil.which("npm") or "npm"


def main():
    parser = argparse.ArgumentParser(
        description="Unified runner for Social Media & E-Commerce Sentiment Analysis Platform."
    )
    parser.add_argument("--backend-only", action="store_true", help="Start only FastAPI backend")
    parser.add_argument("--frontend-only", action="store_true", help="Start only Vite React frontend")
    parser.add_argument("--no-browser", action="store_true", help="Do not open browser automatically")
    parser.add_argument("--backend-port", type=int, default=8000, help="FastAPI backend port (default: 8000)")
    parser.add_argument("--frontend-port", type=int, default=3000, help="Vite frontend port (default: 3000)")
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parent
    os.chdir(project_root)

    print(f"\n{BOLD}{CYAN}=================================================================={RESET}")
    print(f"{BOLD}{GREEN}  Social Media & E-Commerce Sentiment Analysis Platform (v2.0){RESET}")
    print(f"{CYAN}  Multi-Channel Live Scraping + 2-Tier NLP Engine + Sub-Second Exports{RESET}")
    print(f"{BOLD}{CYAN}=================================================================={RESET}\n")

    backend_proc = None
    frontend_proc = None

    # Step 1: Port conflict handling
    if not args.frontend_only:
        if is_port_in_use(args.backend_port):
            print(f"{YELLOW}[PORT CONFLICT]{RESET} Port {args.backend_port} is busy. Freeing lingering process...")
            free_port(args.backend_port)

    if not args.backend_only:
        if is_port_in_use(args.frontend_port):
            print(f"{YELLOW}[PORT CONFLICT]{RESET} Port {args.frontend_port} is busy. Freeing lingering process...")
            free_port(args.frontend_port)

    # Step 2: Signal Handlers for Clean Shutdown
    def handle_exit(sig=None, frame=None):
        print(f"\n\n{YELLOW}[SHUTDOWN]{RESET} Stopping all running servers gracefully...")
        if backend_proc:
            print(f"  Stopping Backend (PID: {backend_proc.pid})...")
            kill_process_tree(backend_proc)
        if frontend_proc:
            print(f"  Stopping Frontend (PID: {frontend_proc.pid})...")
            kill_process_tree(frontend_proc)
        print(f"{GREEN}[SHUTDOWN COMPLETE]{RESET} All servers terminated cleanly.\n")
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_exit)
    signal.signal(signal.SIGTERM, handle_exit)

    # Step 3: Launch FastAPI Backend
    if not args.frontend_only:
        backend_cmd = [
            sys.executable,
            "-m",
            "uvicorn",
            "sentiment_module.app.main:app",
            "--host",
            "0.0.0.0",
            "--port",
            str(args.backend_port),
            "--reload",
        ]
        print(f"{CYAN}[BACKEND]{RESET} Starting FastAPI backend on port {args.backend_port}...")
        backend_proc = subprocess.Popen(
            backend_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            cwd=str(project_root),
        )

        threading.Thread(
            target=stream_logs,
            args=(backend_proc.stdout, "BACKEND", BLUE),
            daemon=True,
        ).start()

    # Step 4: Launch Vite Frontend
    if not args.backend_only:
        npm_bin = get_npm_executable()
        frontend_cmd = [npm_bin, "run", "dev"]
        print(f"{MAGENTA}[FRONTEND]{RESET} Starting Vite React frontend on port {args.frontend_port}...")
        frontend_proc = subprocess.Popen(
            frontend_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            cwd=str(project_root),
        )

        threading.Thread(
            target=stream_logs,
            args=(frontend_proc.stdout, "FRONTEND", MAGENTA),
            daemon=True,
        ).start()

    # Step 5: Health Check & Auto-Open Browser
    print(f"\n{YELLOW}[INITIALIZING]{RESET} Waiting for servers to initialize...")
    backend_ok = True
    frontend_ok = True

    if not args.frontend_only:
        backend_ok = wait_for_health(f"http://127.0.0.1:{args.backend_port}/api/settings/keys", timeout_sec=20)
    if not args.backend_only:
        frontend_ok = wait_for_health(f"http://localhost:{args.frontend_port}/", timeout_sec=20)

    print()
    if backend_ok and frontend_ok:
        print(f"{BOLD}{GREEN}[SUCCESS] ALL SERVERS ACTIVE & HEALTHY!{RESET}")
        if not args.frontend_only:
            print(f"  {CYAN}* Backend API:{RESET}       http://127.0.0.1:{args.backend_port}")
            print(f"  {CYAN}* Swagger Docs:{RESET}      http://127.0.0.1:{args.backend_port}/docs")
        if not args.backend_only:
            print(f"  {MAGENTA}* React Dashboard:{RESET}   http://localhost:{args.frontend_port}")
        print(f"\n{BOLD}Press {RED}Ctrl+C{RESET} {BOLD}at any time to safely stop all servers.{RESET}\n")

        if not args.no_browser and not args.backend_only:
            try:
                time.sleep(0.5)
                webbrowser.open(f"http://localhost:{args.frontend_port}")
            except Exception:
                pass
    else:
        print(f"{YELLOW}[NOTICE] Some services took longer than expected to report healthy, but processes are active.{RESET}")
        print(f"  Check the console output above for any compilation or import warnings.")

    # Step 6: Keep Main Thread Alive
    try:
        while True:
            time.sleep(1)
            # If a process exited unexpectedly, notify user
            if backend_proc and backend_proc.poll() is not None:
                print(f"{RED}[ERROR]{RESET} Backend process exited with code {backend_proc.returncode}")
                break
            if frontend_proc and frontend_proc.poll() is not None:
                print(f"{RED}[ERROR]{RESET} Frontend process exited with code {frontend_proc.returncode}")
                break
    except KeyboardInterrupt:
        handle_exit()


if __name__ == "__main__":
    main()
