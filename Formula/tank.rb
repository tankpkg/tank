class Tank < Formula
  desc "Security-first package manager for AI agent skills"
  homepage "https://tankpkg.dev"
  version "0.15.5"
  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-arm64.tar.gz"
    sha256 "c5ccd1b917ea80a6494de28035ae76e3901e2c33bcca3b2e7e2681c29f0bc39b"
  elsif OS.mac?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-x64.tar.gz"
    sha256 "072847919b37a5dcd2fa56e621ccce18d3ce6011435691b9035ca260ed71dba2"
  elsif OS.linux? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-arm64.tar.gz"
    sha256 "c1419a44bfec72ad2885a64358bee0bf44f97333ffffcab4d655a53613df89d5"
  else
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-x64.tar.gz"
    sha256 "666b5a7aebc1cd625e71b530fcabfbf54fffc54ba6e686cbe5245a44df0876dc"
  end
  def install
    bin.install Dir["tank-*"].first => "tank"
  end
  test do
    system "#{bin}/tank", "--version"
  end
end
