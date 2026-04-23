class Tank < Formula
  desc "Security-first package manager for AI agent skills"
  homepage "https://tankpkg.dev"
  version "0.14.4"
  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-arm64.tar.gz"
    sha256 "b9d8fd886d99c28edd99fb286227c1243f2f64551af2aa232ed18fcd337a5e17"
  elsif OS.mac?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-x64.tar.gz"
    sha256 "5eb1fdfa1e43df03f2df1ea623f43ebafaf664d1c2cd072de77181633e4af939"
  elsif OS.linux? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-arm64.tar.gz"
    sha256 "277efb5acb99e03bc49dd5470e623bd5c9c89f9ddc5dbb7985222673d7110419"
  else
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-x64.tar.gz"
    sha256 "4a37e2ae6d5dbb982582ebad3a3bd971eb7f119e6b81eeb54b2ed849123be6c7"
  end
  def install
    bin.install Dir["tank-*"].first => "tank"
  end
  test do
    system "#{bin}/tank", "--version"
  end
end
