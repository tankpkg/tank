class Tank < Formula
  desc "Security-first package manager for AI agent skills"
  homepage "https://tankpkg.dev"
  version "0.10.2"
  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-arm64.tar.gz"
    sha256 "67dea091e3d9185e5677357164d4b57db42f6f40328d7c18af9e85985ba3382f"
  elsif OS.mac?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-x64.tar.gz"
    sha256 "b9e94dde60869c5f445dd74bb00d79e6594a98a30e7100f53d121a88678bc85b"
  elsif OS.linux? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-arm64.tar.gz"
    sha256 "8d055dcdcdde336a9a11d923a6d5ee8e1a962b3f1776676aef53a6516ee7d0ad"
  else
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-x64.tar.gz"
    sha256 "4c77e802fc303282e7495ae556312170a1fdacf889ca224983bd4561c4e700b3"
  end
  def install
    bin.install Dir["tank-*"].first => "tank"
  end
  test do
    system "#{bin}/tank", "--version"
  end
end
