"""
PhD Nexus Python Engine - Quick start script
Run this to start the science engine locally.
"""
import subprocess, sys
subprocess.run([sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8765", "--reload"])
