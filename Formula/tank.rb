class Tank < Formula
  desc "Security-first package manager for AI agent skills"
  homepage "https://tankpkg.dev"
  version "0.16.3"
  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-arm64.tar.gz"
    sha256 "1214b47bba3e198fb010d9768cfd1afc3fb09b5485eb6e6a4718bfb2ab5fb675"
  elsif OS.mac?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-x64.tar.gz"
    sha256 "033d2e7bdb535d2ff2002881d69f56d2286ca6217d6b6b04559cdcccfddd8dda"
  elsif OS.linux? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-arm64.tar.gz"
    sha256 "c830ee7bed5d6ddefc12997b0eee5eb53051b1ec4a60a1bfb9a5351629418edd"
  else
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-x64.tar.gz"
    sha256 "56615fd3cbf41df7ccdea240f3a341c71e8bdcf97cacb4edabaf948df37520ed"
  end
  def install
    bin.install Dir["tank-*"].first => "tank"
  end
  test do
    system "#{bin}/tank", "--version"
  end
end
