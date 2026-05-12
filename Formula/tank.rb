class Tank < Formula
  desc "Security-first package manager for AI agent skills"
  homepage "https://tankpkg.dev"
  version "0.15.7"
  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-arm64.tar.gz"
    sha256 "f566f8e8e76fc9b1d9132c88517085fdae9864ae27ae12efe3afc1b6b9ed621e"
  elsif OS.mac?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-x64.tar.gz"
    sha256 "e1873c427e189a11ca116302e96e526069b159244503dc7cf80a46e0fb8e7568"
  elsif OS.linux? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-arm64.tar.gz"
    sha256 "49b344c10e9a2a72b5133f16a1c8c0f87541417825ffff1a8ba5946859c1f737"
  else
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-x64.tar.gz"
    sha256 "2c8d0849953ca8a9b8262ff53e0fb3c8c0f6bd4f994c7228dad958cf8df0fdfe"
  end
  def install
    bin.install Dir["tank-*"].first => "tank"
  end
  test do
    system "#{bin}/tank", "--version"
  end
end
