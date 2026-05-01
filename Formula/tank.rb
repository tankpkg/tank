class Tank < Formula
  desc "Security-first package manager for AI agent skills"
  homepage "https://tankpkg.dev"
  version "0.15.3"
  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-arm64.tar.gz"
    sha256 "5bc10d020c8081565cd3f6b071ce4bbcef08f2c871bd4f815310259cbaf8b7ae"
  elsif OS.mac?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-x64.tar.gz"
    sha256 "5ede4ec77c3b8a79453d1291d195c177b7f8974d8b0882fdb0e7187c0c2dd66b"
  elsif OS.linux? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-arm64.tar.gz"
    sha256 "590d76f39a25f5927c6ba4558bee76b767bc78886829e85adecf8d6a07fc6658"
  else
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-x64.tar.gz"
    sha256 "2b05c2194b0300da4bd917712fd606d1b06989b6be0e53991eb675d472a70588"
  end
  def install
    bin.install Dir["tank-*"].first => "tank"
  end
  test do
    system "#{bin}/tank", "--version"
  end
end
