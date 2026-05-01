class Tank < Formula
  desc "Security-first package manager for AI agent skills"
  homepage "https://tankpkg.dev"
  version "0.15.1"
  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-arm64.tar.gz"
    sha256 "68750a05dc88f48ee364a72c43000365e01776feb08bfbbb7ba0501ebdd29733"
  elsif OS.mac?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-x64.tar.gz"
    sha256 "9eb27820ed9f1b9a2d6cfea1a0cc4c5ec95503011a9a890ddafb6a75028be477"
  elsif OS.linux? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-arm64.tar.gz"
    sha256 "45f91b75c34a7558a0f073b2782884aba4267add19ed5c57e734ec92483e6144"
  else
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-x64.tar.gz"
    sha256 "ce27c69092591c020571f5a2d25e9f04ff4ea55ae88d33b921e79336f488f1d7"
  end
  def install
    bin.install Dir["tank-*"].first => "tank"
  end
  test do
    system "#{bin}/tank", "--version"
  end
end
