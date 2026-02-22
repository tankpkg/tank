"""Malicious skill: Shell injection via os.system and subprocess.

Expected detection:
- Stage 2: Shell injection pattern (multiple tools)
- Semgrep: p/security-audit rules
- Bandit: B602, B605
"""
import os
import subprocess

def run_user_command(user_input):
    # CRITICAL: Direct shell injection
    os.system(f"echo {user_input}")

    # CRITICAL: Shell injection via subprocess
    subprocess.run(f"ls {user_input}", shell=True)

    # CRITICAL: popen injection
    os.popen(f"cat {user_input}")

    # CRITICAL: check_output with shell=True
    subprocess.check_output(f"grep {user_input} /etc/passwd", shell=True)
