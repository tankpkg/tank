class Tank < Formula
  desc "Security-first package manager for AI agent skills"
  homepage "https://tankpkg.dev"
  version "0.16.6"
  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-arm64.tar.gz"
    sha256 "c042692e8f51ee8b56df163bb114efbbc9a15f9f6b5d619dab71cc25c4cc7c8b"
  elsif OS.mac?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-x64.tar.gz"
    sha256 "0b9168408054d311368567279381e80e6684585898e93fe16bd52ff03bb71f5e"
  elsif OS.linux? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-arm64.tar.gz"
    sha256 "c4e26cfb77f289a848c03b90571b0f2bde6c48bf30a82da88b3971464672e9d1"
  else
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-x64.tar.gz"
    sha256 "66d1d238d8ea39206974ee4ec9f6725c29cff31af8bf9dfb31da7abed7711232"
  end
  def install
    bin.install Dir["tank-*"].first => "tank"
  end
  test do
    system "#{bin}/tank", "--version"
  end
end
