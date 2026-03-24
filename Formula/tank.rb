class Tank < Formula
  desc "Security-first package manager for AI agent skills"
  homepage "https://tankpkg.dev"
  version "0.10.1"
  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-arm64.tar.gz"
    sha256 "f6001a36aa0e0ca43d040c9729eb396c557cbb3daacce5156e8453bba5d2de7e"
  elsif OS.mac?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-x64.tar.gz"
    sha256 "33d8ae50ff90bf8fc53729133747bfe04d130706b976c70b3023d5a005a4d2c0"
  elsif OS.linux? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-arm64.tar.gz"
    sha256 "cec56e9435e27f81d58b760a7197ae5a3e992dc47fdd70e0aa9aa3338f56815b"
  else
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-x64.tar.gz"
    sha256 "4dca6cbce9e8a93af3c0a5b1c0e2ae49a2bb3e33ae9d6e9939f316bba08cb9b1"
  end
  def install
    bin.install Dir["tank-*"].first => "tank"
  end
  test do
    system "#{bin}/tank", "--version"
  end
end
