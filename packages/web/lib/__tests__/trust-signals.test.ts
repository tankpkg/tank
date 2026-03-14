import { describe, expect, it } from "vitest";
import { formatInstallCount, isPublisherVerified, formatLastScanLabel } from "@/lib/trust-signals";

describe("trust signal helpers", () => {
  it("formats install counts for card/detail badges", () => {
    expect(formatInstallCount(0)).toBe("0 installs");
    expect(formatInstallCount(1)).toBe("1 install");
    expect(formatInstallCount(1250)).toBe("1,250 installs");
  });

  it("marks publisher as verified only when ownership is verified", () => {
    expect(isPublisherVerified({ emailVerified: true, githubUsername: "tankpkg" })).toBe(true);
    expect(isPublisherVerified({ emailVerified: false, githubUsername: "tankpkg" })).toBe(false);
    expect(isPublisherVerified({ emailVerified: true, githubUsername: null })).toBe(false);
  });

  it("formats scan recency text", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(formatLastScanLabel(twoDaysAgo)).toMatch(/^Scanned /);
    expect(formatLastScanLabel(null)).toBe("Scan pending");
  });
});
