// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const blob = vi.hoisted(() => ({ issueSignedToken: vi.fn() }));
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
async function prepare() {
  return await (
    await POST(req({ mimeType: "audio/webm", size: 5500000 }))
  ).json();
}
function event(
  prepared: { audioRef: unknown; pathname: string },
  override = {},
) {
  return {
    type: "blob.generate-presigned-url",
    payload: {
      pathname: prepared.pathname,
      multipart: false,
      clientPayload: JSON.stringify({
        audioRef: prepared.audioRef,
        mimeType: "audio/webm",
        size: 5500000,
      }),
      ...override,
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BLOB_WEBHOOK_PUBLIC_KEY", "synthetic-public-key-for-tests");
  blob.issueSignedToken.mockImplementation(async (options) => ({
    delegationToken:
      Buffer.from(JSON.stringify({ storeId: "fixture", ...options })).toString(
        "base64url",
      ) + ".synthetic",
    clientSigningToken: "private-test-material",
    validUntil: options.validUntil,
  }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllEnvs());
describe("official presigned upload", () => {
  it("prepares distinct server-generated paths without issuing upload credentials", async () => {
    const first = await prepare(),
      second = await prepare();
    expect(first.pathname).toBe(audioPath(first.audioRef));
    expect(first.audioRef.key).not.toBe(second.audioRef.key);
    expect(first).not.toHaveProperty("uploadUrl");
    expect(blob.issueSignedToken).not.toHaveBeenCalled();
  });
  it("runs the real SDK helper and returns only restricted presigned payload", async () => {
    const prepared = await prepare();
    const start = Date.now();
    const response = await POST(req(event(prepared)));
    expect(response.status).toBe(200);
    const body = await response.json();
    const options = blob.issueSignedToken.mock.calls[0][0];
    expect(options).toMatchObject({
      pathname: prepared.pathname,
      operations: ["put"],
      allowedContentTypes: ["audio/webm"],
      maximumSizeInBytes: 5500000,
    });
    expect(options.validUntil).toBeGreaterThanOrEqual(start + 180000);
    expect(options.validUntil).toBeLessThanOrEqual(Date.now() + 180000);
    expect(options).not.toHaveProperty("token");
    expect(options).not.toHaveProperty("oidcToken");
    expect(body.type).toBe("blob.generate-presigned-url");
    expect(body.presignedUrlPayload.signature).toBeTruthy();
    expect(body.presignedUrlPayload.params).toMatchObject({
      "vercel-blob-allow-overwrite": "false",
      "vercel-blob-add-random-suffix": "false",
      "vercel-blob-allowed-content-types": "audio/webm",
      "vercel-blob-maximum-size-in-bytes": "5500000",
    });
    expect(JSON.stringify(body)).not.toContain("private-test-material");
    expect(body.presignedUrlPayload.params).not.toHaveProperty(
      "vercel-blob-callback-url",
    );
  });
  it.each([
    { mimeType: "text/html", size: 100 },
    { mimeType: "audio/webm", size: 24000001 },
    { mimeType: "audio/webm", size: 0 },
    { mimeType: "audio/webm", size: -1 },
    { mimeType: "audio/webm", size: 1.5 },
    { mimeType: "audio/webm", size: 100, pathname: "arbitrary.webm" },
  ])("rejects invalid preparation metadata", async (body) => {
    expect((await POST(req(body))).status).toBe(400);
    expect(blob.issueSignedToken).not.toHaveBeenCalled();
  });
  it.each([
    { mimeType: "text/html", size: 100 },
    { mimeType: "audio/webm", size: 24000001 },
  ])(
    "validates metadata again in the SDK authorization call",
    async (invalid) => {
      const prepared = await prepare();
      expect(
        (
          await POST(
            req(
              event(prepared, {
                clientPayload: JSON.stringify({
                  audioRef: prepared.audioRef,
                  ...invalid,
                }),
              }),
            ),
          )
        ).status,
      ).toBe(400);
      expect(blob.issueSignedToken).not.toHaveBeenCalled();
    },
  );
  it("rejects a pathname that does not match the reference", async () => {
    const prepared = await prepare();
    expect(
      (
        await POST(
          req(event(prepared, { pathname: "meeting-audio/other.webm" })),
        )
      ).status,
    ).toBe(400);
    expect(blob.issueSignedToken).not.toHaveBeenCalled();
  });
  it("rejects multipart and legacy token events", async () => {
    const prepared = await prepare();
    expect((await POST(req(event(prepared, { multipart: true })))).status).toBe(
      400,
    );
    expect(
      (
        await POST(
          req({ ...event(prepared), type: "blob.generate-client-token" }),
        )
      ).status,
    ).toBe(400);
    expect(blob.issueSignedToken).not.toHaveBeenCalled();
  });
  it("rejects cross-origin authorization", async () => {
    expect(
      (await POST(req(event(await prepare()), "https://other.test"))).status,
    ).toBe(403);
    expect(blob.issueSignedToken).not.toHaveBeenCalled();
  });
  it("bounds request bytes", async () => {
    expect((await POST(req({ padding: "a".repeat(5000) }))).status).toBe(413);
  });
  it("sanitizes provider errors", async () => {
    blob.issueSignedToken.mockRejectedValue(new Error("private-test-material"));
    const response = await POST(req(event(await prepare())));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private-test-material");
    expect(console.error).toHaveBeenCalledWith(
      "[audio] BLOB_UPLOAD_AUTHORIZATION_FAILED",
    );
  });
  it("returns a safe error if the injected webhook public key is missing", async () => {
    vi.stubEnv("BLOB_WEBHOOK_PUBLIC_KEY", "");
    const response = await POST(req(event(await prepare())));
    expect(response.status).toBe(503);
    expect(blob.issueSignedToken).not.toHaveBeenCalled();
  });
});
