class Tank < Formula
  desc "Security-first package manager for AI agent skills"
  homepage "https://tankpkg.dev"
  version "0.15.0"
  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-arm64.tar.gz"
    sha256 "8cb29e210e85630b9de61e1d392ed33bab80e6a4e7ec085fa3737dba631fd604"
  elsif OS.mac?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-x64.tar.gz"
    sha256 "d591bc1dc008f782938fd419307fa3f40a5a4581549d97141c768d6c79218a7f"
  elsif OS.linux? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-arm64.tar.gz"
    sha256 "c4c5d240ebd7f1117aeb14bea6638ee0cf57f579834bc2892168a0b338d5b731"
  else
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-x64.tar.gz"
    sha256 "3cf19bc3bbfe25d3a444b7535c5025df58400f7c7cde39f256c5156ca85b83c3"
  end
  def install
    bin.install Dir["tank-*"].first => "tank"
  end
  test do
    system "#{bin}/tank", "--version"
  end
end
