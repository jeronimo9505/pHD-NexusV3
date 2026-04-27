"""
PhD Nexus Python Engine - Quick start script
Run this to start the science engine locally.
"""
import subprocess, sys
subprocess.run([sys.executable, "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8888", "--reload"])
