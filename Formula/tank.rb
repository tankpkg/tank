class Tank < Formula
  desc "Security-first package manager for AI agent skills"
  homepage "https://tankpkg.dev"
  version "0.14.1"
  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-arm64.tar.gz"
    sha256 "7b4bfd2e43e4e7f7e7534915e50e43d9bfcd860cb514f0551d9d56f40ba7abb1"
  elsif OS.mac?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-x64.tar.gz"
    sha256 "a3f29f55c5eeea2b0d66cf01daf1d20841c1da5a44689f83bf3cd156df447c06"
  elsif OS.linux? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-arm64.tar.gz"
    sha256 "430aec1c1d5e77658f959ce4aec71e06630976d0d7fc66b3b9d7c829493e08a4"
  else
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-x64.tar.gz"
    sha256 "fb4b8fe0c3ac22698595b578d77cddb2ccbe019a7f5d02e64e8bf8663eadf489"
  end
  def install
    bin.install Dir["tank-*"].first => "tank"
  end
  test do
    system "#{bin}/tank", "--version"
  end
end
