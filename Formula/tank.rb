class Tank < Formula
  desc "Security-first package manager for AI agent skills"
  homepage "https://tankpkg.dev"
  version "0.16.0"
  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-arm64.tar.gz"
    sha256 "7c836e67fa08b37be10398fb6e6eca93e71024c7d86fa7d33ca1e4c4d6b6c4f5"
  elsif OS.mac?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-x64.tar.gz"
    sha256 "7c20d56d9e0ac9f187c850cf8f0c1607d502d76f220c537c114d8e53695bfd0d"
  elsif OS.linux? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-arm64.tar.gz"
    sha256 "fcb9338b88a848c553984c98f4f4050a8a6bafc5da320f84ff70d5c2548ed3a2"
  else
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-x64.tar.gz"
    sha256 "65b227fc98ba89f08cdae9c37161feb00aca26efc41bc3ef59bc2338632b68b9"
  end
  def install
    bin.install Dir["tank-*"].first => "tank"
  end
  test do
    system "#{bin}/tank", "--version"
  end
end
