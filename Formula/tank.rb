class Tank < Formula
  desc "Security-first package manager for AI agent skills"
  homepage "https://tankpkg.dev"
  version "0.16.1"
  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-arm64.tar.gz"
    sha256 "d411fb4f5ba68fb531d63bbcfa49a69802059d63317261ad9570f1fb97794164"
  elsif OS.mac?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-x64.tar.gz"
    sha256 "451066bb037acb9bf7f9d812985b9cc7d0154358f95ab6b0f76c917e99bb678d"
  elsif OS.linux? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-arm64.tar.gz"
    sha256 "c6ff8f29995399ad453cc8579a4b3d56ed76f2d5a5b0c94126e0a0635b690a79"
  else
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-x64.tar.gz"
    sha256 "da8130181ee8ac014d5e84f862edadae53b864ca0117f9eb35f61e9210011a4c"
  end
  def install
    bin.install Dir["tank-*"].first => "tank"
  end
  test do
    system "#{bin}/tank", "--version"
  end
end
