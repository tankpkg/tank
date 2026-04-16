class Tank < Formula
  desc "Security-first package manager for AI agent skills"
  homepage "https://tankpkg.dev"
  version "0.13.0"
  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-arm64.tar.gz"
    sha256 "97293b8a91c4d3b4a5ba1ceaecaaa29823612155ed9e3e3e083e74dacefe097d"
  elsif OS.mac?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-x64.tar.gz"
    sha256 "e7910e0a4e11e33d2a245b0cac1f159d923d5e16dd1c10b96a0569c7c28061a5"
  elsif OS.linux? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-arm64.tar.gz"
    sha256 "652d30e541ca95901cfec2d36c53ffb029d0e4541036f840808080e0c20674e3"
  else
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-x64.tar.gz"
    sha256 "e64512bbb3d36dc55ad8b02ee32cb519ed1ec9d7ccf8816fa40ea4126ae76050"
  end
  def install
    bin.install Dir["tank-*"].first => "tank"
  end
  test do
    system "#{bin}/tank", "--version"
  end
end
