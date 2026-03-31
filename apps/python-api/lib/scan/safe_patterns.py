"""Safe pattern allowlists for the context evaluator.

These are patterns that are known to be safe in specific contexts.
Conservative: only includes patterns that are unambiguously benign.
"""

import re

# Subprocess commands with literal, safe arguments
# These are standard build/dev tooling commands — no user input possible
SAFE_SUBPROCESS_ARGS: set[str] = {
    "git",
    "npm",
    "npx",
    "yarn",
    "pnpm",
    "bun",
    "node",
    "python",
    "python3",
    "pip",
    "pip3",
    "echo",
    "ls",
    "cat",
    "mkdir",
    "cp",
    "mv",
    "rm",
    "test",
    "which",
    "dirname",
    "basename",
    "true",
    "false",
    "date",
    "pwd",
    "whoami",
    "id",
    "uname",
    "env",
    "printenv",
    "head",
    "tail",
    "wc",
    "sort",
    "uniq",
    "grep",
    "find",
    "xargs",
    "make",
    "cargo",
    "go",
    "rustc",
    "javac",
    "java",
    "dotnet",
    "swift",
    "clang",
    "gcc",
}

# Standard environment variables that are safe to access
SAFE_ENV_VARS: set[str] = {
    "NODE_ENV",
    "PATH",
    "HOME",
    "USER",
    "CI",
    "PORT",
    "HOST",
    "LANG",
    "TERM",
    "SHELL",
    "PWD",
    "OLDPWD",
    "TMPDIR",
    "TEMP",
    "TMP",
    "EDITOR",
    "VISUAL",
    "PAGER",
    "TZ",
    "LC_ALL",
    "LC_CTYPE",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_CACHE_HOME",
    "APP_ENV",
    "STAGE",
    "ENVIRONMENT",
    "VERCEL",
    "VERCEL_ENV",
    "VERCEL_URL",
    "RAILWAY_ENVIRONMENT",
    "RENDER",
    "NETLIFY",
    "AWS_REGION",
    "AWS_DEFAULT_REGION",
    "GOOGLE_CLOUD_PROJECT",
    "GOOGLE_CLOUD_REGION",
}

# Dangerous env vars that should NEVER be in safe list
SENSITIVE_ENV_PATTERNS: list[re.Pattern] = [
    re.compile(r"(SECRET|KEY|TOKEN|PASSWORD|PASS|CREDENTIAL|AUTH|PRIVATE)", re.IGNORECASE),
    re.compile(r"(DATABASE_URL|MONGO_URI|REDIS_URL|POSTGRES_URL)", re.IGNORECASE),
    re.compile(r"(AWS_SECRET|AWS_ACCESS|GCP_SERVICE|AZURE_CLIENT)", re.IGNORECASE),
    re.compile(r"(STRIPE|PAYPAL|SENDGRID|TWILIO|SLACK)_?(API|SECRET|KEY|TOKEN)", re.IGNORECASE),
]

# File paths that indicate test/example context
TEST_PATH_PATTERNS: list[re.Pattern] = [
    re.compile(r"(^|/)test", re.IGNORECASE),
    re.compile(r"(^|/)spec/", re.IGNORECASE),
    re.compile(r"(^|/)__tests__/", re.IGNORECASE),
    re.compile(r"(^|/)examples?/", re.IGNORECASE),
    re.compile(r"(^|/)fixtures?/", re.IGNORECASE),
    re.compile(r"(^|/)samples?/", re.IGNORECASE),
    re.compile(r"(^|/)demo/", re.IGNORECASE),
    re.compile(r"_test\.(py|js|ts|go|rs)$", re.IGNORECASE),
    re.compile(r"\.test\.(js|ts|jsx|tsx)$", re.IGNORECASE),
    re.compile(r"\.spec\.(js|ts|jsx|tsx)$", re.IGNORECASE),
]

# Build/config file names that are expected to contain tooling commands
BUILD_FILE_NAMES: set[str] = {
    "Makefile",
    "makefile",
    "justfile",
    "Justfile",
    "setup.py",
    "setup.cfg",
    "pyproject.toml",
    "build.py",
    "gulpfile.js",
    "gruntfile.js",
    "webpack.config.js",
    "vite.config.ts",
    "rollup.config.js",
    "tsconfig.json",
    ".eslintrc.js",
    ".eslintrc.cjs",
    "biome.json",
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
}


def is_safe_subprocess_call(call_args: str | list[str]) -> bool:
    """Check if subprocess call arguments are all safe literals.

    Args:
        call_args: String representation or list of args.

    Returns:
        True if all arguments are safe command names or their standard flags.
    """
    if isinstance(call_args, str):
        # Extract first argument (the command)
        parts = call_args.strip().split()
        if not parts:
            return False
        command = parts[0]
    elif isinstance(call_args, list):
        if not call_args:
            return False
        command = call_args[0] if isinstance(call_args[0], str) else str(call_args[0])
    else:
        return False

    return command in SAFE_SUBPROCESS_ARGS


def is_safe_env_var(var_name: str) -> bool:
    """Check if an environment variable name is safe to access.

    Args:
        var_name: The env var name (e.g. "NODE_ENV", "DB_PASSWORD").

    Returns:
        True if the var is in the safe list and doesn't match sensitive patterns.
    """
    # Check if it matches any sensitive pattern first
    for pattern in SENSITIVE_ENV_PATTERNS:
        if pattern.search(var_name):
            return False

    return var_name in SAFE_ENV_VARS


def is_test_file(file_path: str) -> bool:
    """Check if a file path indicates a test/example context.

    Args:
        file_path: Relative file path.

    Returns:
        True if the path matches test/example patterns.
    """
    return any(pattern.search(file_path) for pattern in TEST_PATH_PATTERNS)


def is_build_file(file_path: str) -> bool:
    """Check if a file is a build/config script.

    Args:
        file_path: Relative file path.

    Returns:
        True if the file name matches known build file names.
    """
    from pathlib import PurePosixPath

    name = PurePosixPath(file_path).name
    return name in BUILD_FILE_NAMES
