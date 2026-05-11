class Tank < Formula
  desc "Security-first package manager for AI agent skills"
  homepage "https://tankpkg.dev"
  version "0.15.6"
  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-arm64.tar.gz"
    sha256 "034fe3d2116a71a1790b8689a00d368a76590ab6a04b4a278dd2551e322674e6"
  elsif OS.mac?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-x64.tar.gz"
    sha256 "6bd9b99f1e0de88764552e71006db8799b6f2cc6b6ac0351629aa2e6b10c1367"
  elsif OS.linux? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-arm64.tar.gz"
    sha256 "4d50825496bd42ab49a886d7c87921338aa0cdbdda1ac174cc4abe33a2d2ac96"
  else
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-x64.tar.gz"
    sha256 "7418d27ad910893f897c8ab8a9ed34f8a5e02cef40835f6a508b24d7d3d05139"
  end
  def install
    bin.install Dir["tank-*"].first => "tank"
  end
  test do
    system "#{bin}/tank", "--version"
  end
end
