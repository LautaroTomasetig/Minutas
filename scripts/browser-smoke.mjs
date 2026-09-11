import { createHash } from "node:crypto";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const baseURL = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";
const output = path.resolve("test-results");
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  ...(process.platform === "win32"
    ? {
        executablePath:
          "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      }
    : {}),
  headless: true,
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ],
});
const errors = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    permissions: ["microphone"],
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseURL);
  await page.screenshot({
    path: path.join(output, "home-desktop.png"),
    fullPage: true,
  });
  await page
    .getByRole("link", { name: /EMPEZÁ POR UNA CONVERSACIÓN/i })
    .click();
  await page
    .getByLabel(/Título de la reunión/i)
    .fill("Seguimiento del proyecto");
  await page.getByLabel(/Autor de la minuta/i).fill("Ana Pérez");
  await page.getByLabel(/Lugar o modalidad/i).fill("Sala de reuniones");
  await page.getByRole("button", { name: "Agregar participante" }).click();
  await page.getByLabel("Participante 1", { exact: true }).fill("Luis García");
  await page.getByLabel(/Área/).fill("Ingeniería");
  await page.screenshot({
    path: path.join(output, "form-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Iniciar reunión" }).click();
  await page.getByText("Grabando", { exact: true }).waitFor();
  await page.waitForTimeout(1400);
  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  await page.getByText("En pausa", { exact: true }).waitFor();
  await page.screenshot({
    path: path.join(output, "recording-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Reanudar", exact: true }).click();
  await page
    .getByRole("button", { name: "Finalizar reunión", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Sí, finalizar" }).click();
  await page.getByText("Grabación finalizada", { exact: true }).waitFor();
  const audioDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: "Descargar audio" }).click();
  await (await audioDownload).saveAs(path.join(output, "recorded-audio.webm"));
  assert((await fs.stat(path.join(output, "recorded-audio.webm"))).size > 500);

  // Simulate Blob and AI responses. Recording, editing and PDF use real code.
  const transcript =
    "Luis: El prototipo está aprobado. Voy a compartirlo con el equipo. Ana: Queda pendiente definir la fecha de la próxima entrega.";
  const audioRef = { key: "a".repeat(64), extension: "webm" };
  const pathname =
    "meeting-audio/" +
    createHash("sha256").update(audioRef.key).digest("hex") +
    ".webm";
  let sdkAuthorizationSeen = false;
  let sdkUploadSeen = false;
  await page.route("**/api/audio/upload", async (route) => {
    const body = route.request().postDataJSON();
    assert(route.request().postDataBuffer().length < 4096);
    if (body.type === "blob.generate-presigned-url") {
      assert.equal(body.payload.pathname, pathname);
      assert.equal(body.payload.multipart, false);
      const payload = JSON.parse(body.payload.clientPayload);
      assert.deepEqual(payload.audioRef, audioRef);
      assert.equal(payload.mimeType, "audio/webm");
      assert(payload.size > 500);
      sdkAuthorizationSeen = true;
      const delegationToken =
        Buffer.from(
          JSON.stringify({
            storeId: "smokefixture",
            pathname,
            operations: ["put"],
            validUntil: Date.now() + 180000,
          }),
        ).toString("base64url") + ".synthetic";
      await route.fulfill({
        json: {
          type: body.type,
          presignedUrlPayload: {
            delegationToken,
            signature: "synthetic",
            params: {},
          },
        },
      });
      return;
    }
    assert(body.size > 500);
    assert.equal(body.mimeType, "audio/webm");
    await route.fulfill({ json: { success: true, audioRef, pathname } });
  });
  await page.route("https://vercel.com/api/blob/**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "PUT",
          "access-control-allow-headers":
            route.request().headers()["access-control-request-headers"] || "*",
        },
      });
      return;
    }
    assert(sdkAuthorizationSeen);
    const request = route.request();
    assert.equal(request.method(), "PUT");
    assert(request.postDataBuffer().length > 500);
    assert.equal(new URL(request.url()).searchParams.get("pathname"), pathname);
    const headers = request.headers();
    assert.equal(headers["x-vercel-blob-access"], "private");
    assert.equal(headers["x-content-type"], "audio/webm");
    assert(headers["x-api-version"]);
    assert(headers["x-vercel-blob-store-id"]);
    assert.equal(headers.authorization, undefined);
    sdkUploadSeen = true;
    await route.fulfill({
      status: 200,
      json: {
        pathname,
        url: "https://smokefixture.private.blob.vercel-storage.com/" + pathname,
        downloadUrl:
          "https://smokefixture.private.blob.vercel-storage.com/" + pathname,
        contentType: "audio/webm",
        contentDisposition: "attachment",
        etag: "fixture",
      },
      headers: { "access-control-allow-origin": "*" },
    });
  });
  await page.route("**/api/transcribe", async (route) => {
    assert(sdkUploadSeen);
    assert(route.request().postDataBuffer().length < 4096);
    assert.deepEqual(route.request().postDataJSON(), { audioRef });
    await route.fulfill({
      json: { success: true, transcript, detectedLanguage: "es" },
    });
  });
  await page.route("**/api/minutes", async (route) => {
    const { meeting, transcript: received } = route.request().postDataJSON();
    assert.equal(received, transcript);
    await route.fulfill({
      json: {
        success: true,
        minutes: {
          title: `Minuta de reunión ${meeting.title}`,
          author: meeting.author,
          date: meeting.date,
          time: meeting.time,
          location: meeting.location,
          participants: [{ area: "Ingeniería", people: ["Luis García"] }],
          introduction:
            "Se revisaron los avances del proyecto y las acciones para la próxima entrega.",
          topics: [
            {
              number: 1,
              title: "Revisión del prototipo",
              description: "El equipo confirmó la aprobación del prototipo.",
              decision: "Aprobar el prototipo.",
              action: "Compartir el prototipo con el equipo.",
              responsible: "Luis García",
              deadline: null,
              pendingIssue: null,
              status: null,
            },
            {
              number: 2,
              title: "Próxima entrega",
              description: "Se conversó sobre la fecha de la próxima entrega.",
              decision: null,
              action: null,
              responsible: null,
              deadline: null,
              pendingIssue: "Definir la fecha de entrega.",
              status: "pending",
            },
          ],
        },
      },
    });
  });
  await page.getByRole("button", { name: "Procesar reunión" }).click();
  await page
    .getByRole("heading", { name: "Revisión del prototipo", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Editar punto 1", exact: true })
    .click();
  await page.getByLabel("Responsable", { exact: true }).fill("Ana Pérez");
  await page.getByLabel("Estado", { exact: true }).selectOption("closed");
  assert(await page.getByRole("button", { name: "Exportar PDF" }).isDisabled());
  await page
    .getByRole("button", { name: "Aplicar cambios", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Eliminar punto 2", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Eliminar punto", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Agregar punto", exact: true })
    .click();
  await page.getByLabel("Título del punto").fill("Seguimiento de la entrega");
  await page
    .getByLabel("Descripción", { exact: true })
    .fill("Se revisará la fecha en la próxima reunión.");
  await page
    .getByRole("button", { name: "Aplicar cambios", exact: true })
    .click();
  await page.screenshot({
    path: path.join(output, "result-desktop.png"),
    fullPage: true,
  });
  let pdfPayload;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/pdf")) pdfPayload = request.postDataJSON();
  });
  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar PDF", exact: true }).click();
  await (await pdfDownload).saveAs(path.join(output, "minuta.pdf"));
  assert.equal(pdfPayload.topics[0].responsible, "Ana Pérez");
  assert.equal(pdfPayload.topics[0].status, "closed");
  assert.equal(pdfPayload.topics[1].number, 2);
  const pdf = await fs.readFile(path.join(output, "minuta.pdf"));
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(output, "result-mobile.png"),
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(baseURL);
  await mobile.screenshot({
    path: path.join(output, "home-mobile.png"),
    fullPage: true,
  });
  assert(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await mobile.goto(`${baseURL}/reuniones/nueva`);
  await mobile.screenshot({
    path: path.join(output, "form-mobile.png"),
    fullPage: true,
  });
  assert(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  const invalid = await context.request.post(`${baseURL}/api/minutes`, {
    data: {},
  });
  assert.equal(invalid.status(), 400);
  const invalidAudio = await context.request.post(`${baseURL}/api/transcribe`, {
    multipart: {},
  });
  assert.equal(invalidAudio.status(), 415);
  assert.deepEqual(errors, []);
  console.log(
    "Browser smoke passed: native recording with synthetic microphone, pause/resume, confirmation, download, direct upload with simulated Blob and AI, editing, deletion, numbering, real PDF export, responsive views, invalid APIs. Screenshots and files in test-results/.",
  );
} finally {
  await browser.close();
}
