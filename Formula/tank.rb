class Tank < Formula
  desc "Security-first package manager for AI agent skills"
  homepage "https://tankpkg.dev"
  version "0.1.8"

  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-arm64.tar.gz"
    sha256 "3c37ab0ea5394018ad3a7dd2e5db742a4a4189c07585dfff48baa2b619d0e7bc"
  elsif OS.mac?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-x64.tar.gz"
    sha256 "bc9bdc473072a0b391e19ebab405f355889c6371da401787c82fc097d5bf4204"
  elsif OS.linux? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-arm64.tar.gz"
    sha256 "3987b34c64c59c0c29f0deb1d90d656b47b211e84f61c1fe600fa8844598264b"
  else
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-x64.tar.gz"
    sha256 "7aae32062c0a564c99ba914bd4bd7ef809b7f563420f58c8adb03dd6b9d104cc"
  end

  def install
    bin.install "tank-#{OS.mac? ? \"darwin\" : \"linux\"}-#{Hardware::CPU.arm? ? \"arm64\" : \"x64\"}" => "tank"
  end

  test do
    system "#{bin}/tank", "--version"
  end
end
