#!/usr/bin/env sh
set -eu

REPO="tankpkg/tank"

info() {
  printf '%s\n' "$*"
}

error() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || error "Missing required command: $1"
}

fetch() {
  url="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url"
    return
  fi
  if command -v wget >/dev/null 2>&1; then
    wget -qO- "$url"
    return
  fi
  error "Neither curl nor wget is installed. Install one and retry."
}

download() {
  url="$1"
  out="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$out"
    return
  fi
  if command -v wget >/dev/null 2>&1; then
    wget -qO "$out" "$url"
    return
  fi
  error "Neither curl nor wget is installed. Install one and retry."
}

os="$(uname -s)"
arch="$(uname -m)"

case "$os" in
  Darwin)
    os_id="darwin"
    ;;
  Linux)
    os_id="linux"
    ;;
  *)
    error "Unsupported OS: $os"
    ;;
esac

case "$arch" in
  x86_64)
    arch_id="x64"
    ;;
  arm64|aarch64)
    arch_id="arm64"
    ;;
  *)
    error "Unsupported architecture: $arch"
    ;;
esac

binary_name="tank-${os_id}-${arch_id}"

info "Resolving latest release for $REPO..."
release_json="$(fetch "https://api.github.com/repos/${REPO}/releases/latest")"
tag="$(printf '%s' "$release_json" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
[ -n "$tag" ] || error "Could not resolve latest release tag from GitHub API"

base_url="https://github.com/${REPO}/releases/download/${tag}"
bin_url="${base_url}/${binary_name}"
sums_url="${base_url}/SHA256SUMS"

tmpdir="$(mktemp -d 2>/dev/null || mktemp -d -t tank-install)"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT INT TERM

tmp_bin="$tmpdir/$binary_name"
tmp_sums="$tmpdir/SHA256SUMS"

info "Downloading $binary_name..."
download "$bin_url" "$tmp_bin" || error "Failed to download $bin_url"

info "Downloading checksums..."
download "$sums_url" "$tmp_sums" || error "Failed to download $sums_url"

need_cmd awk
expected_sum="$(awk -v name="$binary_name" '$2==name { print $1 }' "$tmp_sums")"
[ -n "$expected_sum" ] || error "Could not find checksum for $binary_name in SHA256SUMS"

need_cmd shasum
actual_sum="$(shasum -a 256 "$tmp_bin" | awk '{print $1}')"

if [ "$expected_sum" != "$actual_sum" ]; then
  error "Checksum mismatch for $binary_name. Aborting for security reasons."
fi

info "Checksum verified."
chmod +x "$tmp_bin"

target_dir="/usr/local/bin"
target_path="$target_dir/tank"

if [ -w "$target_dir" ]; then
  mv "$tmp_bin" "$target_path"
elif command -v sudo >/dev/null 2>&1 && [ -t 1 ]; then
  sudo mv "$tmp_bin" "$target_path"
  sudo chmod +x "$target_path"
else
  target_dir="$HOME/.local/bin"
  target_path="$target_dir/tank"
  mkdir -p "$target_dir"
  mv "$tmp_bin" "$target_path"
fi

info "Installed tank to $target_path"
"$target_path" --version || true

case ":$PATH:" in
  *":$target_dir:"*)
    ;;
  *)
    if [ "$target_dir" = "$HOME/.local/bin" ]; then
      info "Warning: $HOME/.local/bin is not in PATH. Add it to your shell profile."
    fi
    ;;
esac

info "Done."
