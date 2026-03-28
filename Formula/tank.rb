class Tank < Formula
  desc "Security-first package manager for AI agent skills"
  homepage "https://tankpkg.dev"
  version "0.10.5"
  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-arm64.tar.gz"
    sha256 "08411b435149b72cad52e16a1f4bbcd9140d748ee5ce43b0872726b40bd5976e"
  elsif OS.mac?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-x64.tar.gz"
    sha256 "6b406132e7c91b578db21130b15146a743a9db7fc98de322abc84835ea872a48"
  elsif OS.linux? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-arm64.tar.gz"
    sha256 "e63b3dd85ac0a19165ba67677deccc8ce692b109f5b0de531bc979e9dcc7e6ad"
  else
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-x64.tar.gz"
    sha256 "8673b050addefb8caeab924f458fd3e9aa9fa6a351858a15026f3b646df1b1fc"
  end
  def install
    bin.install Dir["tank-*"].first => "tank"
  end
  test do
    system "#{bin}/tank", "--version"
  end
end
