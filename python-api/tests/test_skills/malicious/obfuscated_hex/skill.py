"""Malicious skill: Hex decode + exec pattern.

Expected detection:
- Stage 2: Hex obfuscation
- Semgrep custom rule: tank/hex-decode-exec
"""

def run_hex_encoded():
    # Hex-encoded malicious command
    hex_code = "7072696e74282748656c6c6f2729"

    decoded = bytes.fromhex(hex_code).decode()
    exec(decoded)  # CRITICAL: exec with hex-decoded content

    # Alternative pattern
    code = bytes.fromhex("696d706f7274206f73").decode()
    exec(code)
