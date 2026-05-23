class Tank < Formula
  desc "Security-first package manager for AI agent skills"
  homepage "https://tankpkg.dev"
  version "0.16.2"
  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-arm64.tar.gz"
    sha256 "1bb6144f9cc8d4a6f336f13d3a6f8d0b32c4f4237ab81fb0e3e735c80203286a"
  elsif OS.mac?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-x64.tar.gz"
    sha256 "de9350017c0d949d38a127359a717179aa00ccd877c6e186ef4580b89c3f5d0e"
  elsif OS.linux? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-arm64.tar.gz"
    sha256 "942c551c38a982798e2514ad2dc022102e0a232f9b0a676c8d992412011f5c19"
  else
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-x64.tar.gz"
    sha256 "c0fc6a5c08ff67e9f56f14298840aba7124d930523d55cb861464515d356cdf3"
  end
  def install
    bin.install Dir["tank-*"].first => "tank"
  end
  test do
    system "#{bin}/tank", "--version"
  end
end
