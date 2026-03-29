class Tank < Formula
  desc "Security-first package manager for AI agent skills"
  homepage "https://tankpkg.dev"
  version "0.10.6"
  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-arm64.tar.gz"
    sha256 "3ea956db85e85804220b7ff71263c5b760ad6b4abdda3a342f585d79fd442bd0"
  elsif OS.mac?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-x64.tar.gz"
    sha256 "14046034ad300e38d70d446c44e95af2f444ae1dc5f6f0dfbc3bdc3bc949e9f1"
  elsif OS.linux? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-arm64.tar.gz"
    sha256 "b17c19742899de4ac7bde2a6b4b8c3eb8d55b340bb0d6e7c6384866c5f3cb403"
  else
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-x64.tar.gz"
    sha256 "8fbb55fe546456c9e58a59a606179e03691efea59bd299676a86045c3fc15c0d"
  end
  def install
    bin.install Dir["tank-*"].first => "tank"
  end
  test do
    system "#{bin}/tank", "--version"
  end
end
