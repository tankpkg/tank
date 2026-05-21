class Tank < Formula
  desc "Security-first package manager for AI agent skills"
  homepage "https://tankpkg.dev"
  version "0.15.8"
  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-arm64.tar.gz"
    sha256 "a1ba992692d363fa7e4a74f028da60f0869c3388f1c9314d7846b0cedf8e4c88"
  elsif OS.mac?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-x64.tar.gz"
    sha256 "5ceac4aae1ebb71ce8569ee464d80a4a66c5c4f7950b8836401539e4f63b01cd"
  elsif OS.linux? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-arm64.tar.gz"
    sha256 "a14892bd79002041f74b2466c8b36ee85c6b08150bc28a4496ded4af523470cc"
  else
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-x64.tar.gz"
    sha256 "090bac98e677fadb57f6f404c93039c61b0709718baf7de4c2cb26d165e9486d"
  end
  def install
    bin.install Dir["tank-*"].first => "tank"
  end
  test do
    system "#{bin}/tank", "--version"
  end
end
