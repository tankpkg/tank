class Tank < Formula
  desc "Security-first package manager for AI agent skills"
  homepage "https://tankpkg.dev"
  version "0.14.3"
  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-arm64.tar.gz"
    sha256 "81e7332f32b7f1ba56d3782d8284b84248520fed36ee554293709e7a147d2826"
  elsif OS.mac?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-x64.tar.gz"
    sha256 "60f4e56021c9fa2e7eb3967d3b25c0c944e5a909c3d30a636f8068cfbc752042"
  elsif OS.linux? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-arm64.tar.gz"
    sha256 "655f935d6d10c3a6e4cede13ee3b15f3a49bbab27aaa9030c8424f6848d8aa6a"
  else
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-x64.tar.gz"
    sha256 "8374215c5da937173886bea7349325749b70fd44a8b7eebeff06de8c6d7358fd"
  end
  def install
    bin.install Dir["tank-*"].first => "tank"
  end
  test do
    system "#{bin}/tank", "--version"
  end
end
