// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const blob = vi.hoisted(() => ({
  issueSignedToken: vi.fn(),
  presignUrl: vi.fn(),
}));
vi.mock("@vercel/blob", async (original) => ({
  ...(await original<typeof import("@vercel/blob")>()),
  ...blob,
}));
import { POST } from "./route";
import { audioPath } from "@/lib/server/audioBlob";
const req = (body: unknown, origin = "http://localhost") =>
  new Request("http://localhost/api/audio/upload", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  blob.issueSignedToken.mockResolvedValue({
    delegationToken: "delegation",
    clientSigningToken: "private-test-material",
    validUntil: Date.now() + 180000,
  });
  blob.presignUrl.mockResolvedValue({
    presignedUrl: "https://vercel.com/api/blob/?test=1",
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
describe("audio upload authorization", () => {
  it("generates a new restricted private PUT with injected SDK authentication", async () => {
    const start = Date.now();
    const response = await POST(
      req({ mimeType: "audio/webm", size: 5_500_000 }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    const options = blob.issueSignedToken.mock.calls[0][0];
    expect(options).toMatchObject({
      pathname: audioPath(body.audioRef),
      operations: ["put"],
      allowedContentTypes: ["audio/webm"],
      maximumSizeInBytes: 5_500_000,
    });
    expect(options.validUntil).toBeGreaterThanOrEqual(start + 180000);
    expect(options.validUntil).toBeLessThanOrEqual(Date.now() + 180000);
    expect(options).not.toHaveProperty("token");
    expect(options).not.toHaveProperty("oidcToken");
    expect(blob.presignUrl.mock.calls[0][1]).toMatchObject({
      operation: "put",
      access: "private",
      allowOverwrite: false,
      addRandomSuffix: false,
      pathname: options.pathname,
      maximumSizeInBytes: 5_500_000,
      allowedContentTypes: ["audio/webm"],
    });
    expect(JSON.stringify(body)).not.toContain("private-test-material");
    const second = await (
      await POST(req({ mimeType: "audio/webm", size: 100 }))
    ).json();
    expect(second.audioRef.key).not.toBe(body.audioRef.key);
  });
  it.each([
    { mimeType: "text/html", size: 100 },
    { mimeType: "audio/webm", size: 24_000_001 },
    { mimeType: "audio/webm", size: 0 },
    { mimeType: "audio/webm", size: -1 },
    { mimeType: "audio/webm", size: 1.5 },
    { mimeType: "audio/webm", size: 100, pathname: "arbitrary.webm" },
  ])(
    "rejects invalid MIME/size/path before issuing permissions",
    async (body) => {
      expect((await POST(req(body))).status).toBe(400);
      expect(blob.issueSignedToken).not.toHaveBeenCalled();
    },
  );
  it("rejects cross-origin browser requests", async () => {
    expect(
      (
        await POST(
          req({ mimeType: "audio/webm", size: 100 }, "https://other.test"),
        )
      ).status,
    ).toBe(403);
    expect(blob.issueSignedToken).not.toHaveBeenCalled();
  });
  it("bounds authorization request bytes", async () => {
    expect((await POST(req({ padding: "a".repeat(5000) }))).status).toBe(413);
  });
  it("sanitizes authorization failures", async () => {
    blob.issueSignedToken.mockRejectedValue(new Error("private-test-material"));
    const response = await POST(req({ mimeType: "audio/webm", size: 100 }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private-test-material");
    expect(console.error).toHaveBeenCalledWith(
      "[audio] BLOB_UPLOAD_AUTHORIZATION_FAILED",
    );
  });
});
