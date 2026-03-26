class Tank < Formula
  desc "Security-first package manager for AI agent skills"
  homepage "https://tankpkg.dev"
  version "0.10.4"
  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-arm64.tar.gz"
    sha256 "cb9363114fb9f6a7d20171b674bdfac404d8970b463e98323a9257cc813a0c38"
  elsif OS.mac?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-x64.tar.gz"
    sha256 "4059834e4e69c7a74991aa7312a8badc1fcd6a8c4528d35b89345e3ad3dbeb49"
  elsif OS.linux? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-arm64.tar.gz"
    sha256 "90999cb9ae5d99647c482aba854fa9db6c7e6a02db9c1ad7a2f3ade1656bd832"
  else
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-x64.tar.gz"
    sha256 "16014b533979c2958b418b832210fe4fb71703073b43b2b330571a79c111bfa7"
  end
  def install
    bin.install Dir["tank-*"].first => "tank"
  end
  test do
    system "#{bin}/tank", "--version"
  end
end
