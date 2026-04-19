class Tank < Formula
  desc "Security-first package manager for AI agent skills"
  homepage "https://tankpkg.dev"
  version "0.14.2"
  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-arm64.tar.gz"
    sha256 "176d6a6f122c7881874e4c5ab4c53002296ebd6a405ba984737d12d7fd29a271"
  elsif OS.mac?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-x64.tar.gz"
    sha256 "9c26dfc0e36bfa635570207a50b41bfbaaba0ade991590051c0e4969fa3b5a08"
  elsif OS.linux? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-arm64.tar.gz"
    sha256 "37e8ba45f676047fe1556be9e55d4a390afae6952947f3312380e269cb10bbf2"
  else
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-x64.tar.gz"
    sha256 "85336ab60250fa4d9c5ef9f8c41b97400147c1e7af20766a06b951b6b4ebe629"
  end
  def install
    bin.install Dir["tank-*"].first => "tank"
  end
  test do
    system "#{bin}/tank", "--version"
  end
end
