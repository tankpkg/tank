class Tank < Formula
  desc "Security-first package manager for AI agent skills"
  homepage "https://tankpkg.dev"
  version "0.1.6"

  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-arm64.tar.gz"
    sha256 "c13a6e20dd3ed94b7ae28ba04353fc0db7894bdbbac62e09c82d004c589439ca"
  elsif OS.mac?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-x64.tar.gz"
    sha256 "6274a241dc528287c543e3039d64d9c2e775ba4a57fd6adc71d52510952c392c"
  elsif OS.linux? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-arm64.tar.gz"
    sha256 "23c8cd7be2d444c9fa02555307cb63bcb2afe0209de382529c12d64d27ee397c"
  else
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-x64.tar.gz"
    sha256 "8f0bbef075f8c4ed929814b59864246ff7b2114ac1c5473d3888e6bdf29026bc"
  end

  def install
    bin.install "tank-#{OS.mac? ? \"darwin\" : \"linux\"}-#{Hardware::CPU.arm? ? \"arm64\" : \"x64\"}" => "tank"
  end

  test do
    system "#{bin}/tank", "--version"
  end
end
