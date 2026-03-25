class Tank < Formula
  desc "Security-first package manager for AI agent skills"
  homepage "https://tankpkg.dev"
  version "0.10.3"
  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-arm64.tar.gz"
    sha256 "17d4e91b5bfa465ababda8ead35b0ee854e5cb7bc44f0fd071d779e588a0f1a4"
  elsif OS.mac?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-darwin-x64.tar.gz"
    sha256 "e5e5cbac8ef070e2bae29d15588a443755a6c3164f31d539a327d2c47636742b"
  elsif OS.linux? && Hardware::CPU.arm?
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-arm64.tar.gz"
    sha256 "53ff8cad80fdb10a6bce0e3d66b73bb89bb745c85562385d6264414d31185776"
  else
    url "https://github.com/tankpkg/tank/releases/download/v#{version}/tank-linux-x64.tar.gz"
    sha256 "ec4e24ebf8e3370228ff20026c04fc5f301f18385fd8d9b0299f02421a69f776"
  end
  def install
    bin.install Dir["tank-*"].first => "tank"
  end
  test do
    system "#{bin}/tank", "--version"
  end
end
