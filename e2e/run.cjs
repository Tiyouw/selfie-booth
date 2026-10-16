const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { tmpdir } = require("node:os");
const { createServer } = require("node:net");
const root = path.resolve(__dirname, "..");
const {
  createCanvas,
  loadImage,
} = require("../server/node_modules/@napi-rs/canvas");
const { decompressFromEncodedURIComponent } = require("lz-string");
const base = process.env.E2E_BASE_URL || "http://localhost:3001";
const api = process.env.E2E_API_URL || "http://localhost:8788";
const out = path.join(root, ".hoplite/artifacts/e2e");
const results = [];
let browser;
let dataDir;
const servers = [];
async function startServers() {
  dataDir = await fs.mkdtemp(path.join(tmpdir(), "selfie-booth-e2e-"));
  const front = new URL(base),
    back = new URL(api);
  for (const url of [front, back])
    assert.equal(
      url.hostname,
      "localhost",
      "E2E servers must use localhost URLs",
    );
  for (const url of [front, back]) {
    await new Promise((resolve, reject) => {
      const probe = createServer();
      probe.once("error", reject);
      probe.listen(Number(url.port), () => probe.close(resolve));
    });
  }
  function start(name, args, cwd, env) {
    const child = spawn(process.execPath, args, {
      cwd,
      env: { ...process.env, ...env },
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    child.stdout.on("data", (data) => (log += data));
    child.stderr.on("data", (data) => (log += data));
    servers.push({ child, name, log: () => log });
  }
  start("api", ["dist/server/src/index.js"], path.join(root, "server"), {
    PORT: back.port,
    DATA_DIR: dataDir,
    FRONTEND_ORIGIN: base,
    ALLOWED_ORIGINS: base,
    FRAME_UPLOAD_CODE: "e2e-local-only",
  });
  start(
    "frontend",
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      front.port,
    ],
    root,
    {
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_DIST_DIR: ".next-build",
      NEXT_PUBLIC_SHARE_API: api,
      // A copied API URL with a trailing slash must still load shared viewers.
      SHARE_API: api + "/",
    },
  );
  await until(
    async () => {
      for (const s of servers)
        if (s.child.exitCode !== null)
          throw new Error(s.name + " exited during startup: " + s.log());
      try {
        return (
          (
            await fetch(api + "/v1/health", {
              signal: AbortSignal.timeout(5000),
            })
          ).ok && (await fetch(base, { signal: AbortSignal.timeout(5000) })).ok
        );
      } catch {
        return false;
      }
    },
    Boolean,
    60000,
  );
}
async function cleanup() {
  await browser?.close();
  for (const { child, name, log } of servers) {
    await fs.writeFile(path.join(out, name + ".log"), log());
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      try {
        if (process.platform === "win32") child.kill();
        else process.kill(-child.pid, "SIGTERM");
      } catch (e) {
        if (e.code !== "ESRCH") throw e;
      }
      let timer;
      await Promise.race([
        exited,
        new Promise((resolve) => (timer = setTimeout(resolve, 5000))),
      ]);
      clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) {
        try {
          if (process.platform === "win32") child.kill("SIGKILL");
          else process.kill(-child.pid, "SIGKILL");
        } catch (e) {
          if (e.code !== "ESRCH") throw e;
        }
        await exited;
      }
    }
  }
  if (dataDir) await fs.rm(dataDir, { recursive: true, force: true });
}
function photo(color) {
  const c = createCanvas(640, 480);
  const x = c.getContext("2d");
  x.fillStyle = color;
  x.fillRect(0, 0, 640, 480);
  return c.encodeSync("png");
}
function frame() {
  const c = createCanvas(1920, 1080);
  const x = c.getContext("2d");
  x.fillStyle = "#22aa44";
  x.fillRect(0, 0, 1920, 1080);
  x.clearRect(80, 80, 850, 920);
  x.clearRect(990, 80, 850, 920);
  return c.encodeSync("png");
}
async function draft(page) {
  const raw = await page.evaluate(() =>
    localStorage.getItem("selfie-booth:draft:v2"),
  );
  return raw
    ? JSON.parse(decompressFromEncodedURIComponent(raw.split("|")[0]))
    : null;
}
async function expandPanels(page, ready, timeout = 10000) {
  const end = Date.now() + timeout;
  for (;;) {
    for (const panel of await page.locator("details").all()) {
      // Note: React renders open="" (empty string), so getAttribute alone
      // cannot distinguish closed from open — use the DOM property. A click
      // racing React hydration can be re-collapsed, hence the retry loop.
      if (!(await panel.evaluate((el) => el.open).catch(() => true))) {
        await panel.locator("summary").click().catch(() => {});
      }
    }
    if (!ready || (await ready.isVisible().catch(() => false))) return;
    if (Date.now() > end) throw new Error("Panels did not expand in time");
    await new Promise((r) => setTimeout(r, 250));
  }
}
async function until(fn, predicate, timeout = 10000) {
  const end = Date.now() + timeout;
  let value;
  do {
    value = await fn();
    if (predicate(value)) return value;
    await new Promise((r) => setTimeout(r, 100));
  } while (Date.now() < end);
  throw new Error(
    "Timed out waiting for expected state: " +
      JSON.stringify(value)?.slice(0, 300),
  );
}
async function fillPhoto(page, index = 0, color = "#cc2222") {
  await page
    .getByRole("group", { name: `Foto ${index + 1}`, exact: true })
    .locator("input[type=file]")
    .setInputFiles({
      name: `photo-${index}.png`,
      mimeType: "image/png",
      buffer: photo(color),
    });
  await until(
    () => draft(page),
    (d) => d?.s[index]?.[0]?.startsWith("data:image/jpeg"),
  );
}
async function download(page, button) {
  const [d] = await Promise.all([
    page.waitForEvent("download"),
    button.click(),
  ]);
  assert.equal(await d.failure(), null);
  return fs.readFile(await d.path());
}
async function pngInfo(buffer) {
  const image = await loadImage(buffer);
  const c = createCanvas(image.width, image.height);
  const x = c.getContext("2d");
  x.drawImage(image, 0, 0);
  return {
    width: image.width,
    height: image.height,
    pixel: (px, py) => Array.from(x.getImageData(px, py, 1, 1).data),
  };
}
// Adding frames is code-locked: open the modal, submit the access code, and
// keep it open so the hidden file input can receive the upload.
async function unlockFrameUpload(page, code = "e2e-local-only") {
  await page.getByRole("button", { name: "Tambah frame", exact: true }).click();
  await page.getByLabel("Kode akses", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Lanjut", exact: true }).click();
}
async function test(name, fn, options = {}) {
  if (process.env.E2E_FILTER && !new RegExp(process.env.E2E_FILTER).test(name))
    return;
  console.log("RUN", name);
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1280, height: 900 },
    permissions: ["camera", "clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  const errors = [];
  let deadline;
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(base);
    // Steps live inside collapsed <details> panels; expand them all before
    // waiting for the first interactive control.
    await page.locator("details > summary").first().waitFor();
    await until(() => draft(page), Boolean);
    await expandPanels(
      page,
      page.getByRole("button", { name: "3 Foto", exact: true }),
    );
    await page.getByRole("button", { name: "3 Foto", exact: true }).waitFor();
    await Promise.race([
      fn(page, context),
      new Promise((_, reject) => {
        deadline = setTimeout(
          () => reject(new Error("E2E case exceeded 60 seconds")),
          60000,
        );
      }),
    ]);
    assert.deepEqual(errors, [], "unexpected browser exceptions");
    results.push({ name, status: "passed" });
    console.log("PASS", name);
  } catch (e) {
    results.push({ name, status: "failed", error: e.message });
    console.log("FAIL", name, e.message.split("\n").slice(0, 3).join(" "));
    await page
      .screenshot({
        path: path.join(out, name.replace(/[^a-z0-9]/gi, "-") + ".png"),
        fullPage: true,
      })
      .catch(() => {});
  } finally {
    clearTimeout(deadline);
    await context.close();
  }
}
(async () => {
  await fs.mkdir(out, { recursive: true });
  await fs.rm(path.join(out, "report.json"), { force: true });
  await startServers();
  browser = await chromium.launch({
    executablePath:
      process.env.E2E_CHROMIUM ||
      (require("node:fs").existsSync("/usr/bin/chromium")
        ? "/usr/bin/chromium"
        : undefined),
    headless: true,
    args: [
      "--no-sandbox",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  await test("photo editing, hidden slots, and draft restore", async (page) => {
    await page.getByRole("button", { name: "4 Foto", exact: true }).click();
    for (let i = 0; i < 4; i++)
      await fillPhoto(page, i, ["#cc2222", "#22cc22", "#2222cc", "#cccc22"][i]);
    await page.getByRole("button", { name: "1 Foto", exact: true }).click();
    await until(
      () => draft(page),
      (d) => d?.g === 1,
    );
    assert.ok((await draft(page)).s[3][0]);
    await page.reload();
    await page.getByRole("button", { name: "4 Foto", exact: true }).click();
    await until(
      () => draft(page),
      (d) => d?.g === 4,
    );
    assert.equal(
      await page.getByTestId("booth-preview").getByRole("img").count(),
      4,
    );
    await page.getByRole("button", { name: "Perbesar", exact: true }).click();
    await until(
      () => draft(page),
      (d) => d?.s[0][1] === 1.1,
    );
    await page
      .getByRole("button", { name: "Reset posisi", exact: true })
      .click();
    await until(
      () => draft(page),
      (d) => d?.s[0][1] === 1,
    );
    const beforeMove = await draft(page);
    await page
      .getByRole("group", { name: "Foto 1", exact: true })
      .getByRole("button", { name: "Pindah ke kanan/bawah" })
      .click();
    await until(
      () => draft(page),
      (d) =>
        d?.s[1]?.[0] === beforeMove.s[0][0] &&
        d?.s[0]?.[0] === beforeMove.s[1][0],
    );
    await page
      .getByRole("group", { name: "Foto 2", exact: true })
      .getByRole("button", { name: "Hapus foto", exact: true })
      .click();
    await until(
      () => draft(page),
      (d) => d?.s[1][0] === null,
    );
  });
  await test("PNG and GIF exports, ratio switching", async (page) => {
    await fillPhoto(page);
    const png = await pngInfo(
      await download(
        page,
        page
          .locator("header")
          .getByRole("button", { name: "Download PNG", exact: true }),
      ),
    );
    assert.equal(png.width, 1920);
    assert.equal(png.height, 1080);
    await page.getByRole("button", { name: "Photo Strip 1:3" }).click();
    await until(
      () => draft(page),
      (d) => d?.r === "1:3",
    );
    const strip = await pngInfo(
      await download(
        page,
        page
          .locator("header")
          .getByRole("button", { name: "Download PNG", exact: true }),
      ),
    );
    assert.equal(strip.width, 640);
    assert.equal(strip.height, 1920);
    await page
      .locator("header")
      .getByRole("button", { name: "Bagikan", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Link share" })
      .waitFor({ timeout: 30000 });
    const gif = await download(
      page,
      page.getByRole("button", { name: "Download GIF", exact: true }),
    );
    assert.equal(gif.subarray(0, 6).toString(), "GIF89a");
    assert.equal(gif.readUInt16LE(6), 160);
    assert.equal(gif.readUInt16LE(8), 480);
  });
  await test("custom frame geometry, library, reset, and templates", async (page) => {
    await unlockFrameUpload(page, "wrong-code");
    await page.getByLabel("Upload frame PNG", { exact: true }).setInputFiles({
      name: "Local custom.png",
      mimeType: "image/png",
      buffer: frame(),
    });
    // Wrong access code: the API rejects the upload and the frame must NOT
    // be applied anywhere.
    await until(
      () => page.getByRole("status").textContent(),
      (t) => /kode akses salah/i.test(t || ""),
    );
    assert.ok(
      !(await draft(page)).f?.startsWith("data:image/png"),
      "frame was applied despite a wrong access code",
    );
    assert.equal(
      await page.getByRole("button", { name: "Landscape 16:9" }).isDisabled(),
      false,
    );
    // Correct code: retry in the same modal, then the frame is accepted.
    await page.getByLabel("Kode akses", { exact: true }).fill("e2e-local-only");
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    await page.getByLabel("Upload frame PNG", { exact: true }).setInputFiles({
      name: "Local custom.png",
      mimeType: "image/png",
      buffer: frame(),
    });
    await until(
      () => draft(page),
      (d) => d?.f?.startsWith("data:image/png"),
    );
    assert.equal((await draft(page)).g, 2);
    assert.equal(
      await page.getByRole("button", { name: "Landscape 16:9" }).isDisabled(),
      true,
    );
    await page.reload();
    assert.ok((await draft(page)).f.startsWith("data:image/png"));
    await page
      .locator("header")
      .getByRole("button", { name: "Mulai baru" })
      .click();
    await until(
      () => draft(page),
      (d) => d?.f === "/frames/klasik-16x9.svg",
    );
    await page.reload();
    await expandPanels(
      page,
      page.getByRole("button", { name: "Local custom", exact: true }),
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Local custom", exact: true })
        .count(),
      1,
    );
    const template = await download(
      page,
      page.getByRole("button", { name: "Unduh template PNG", exact: true }),
    );
    assert.equal((await pngInfo(template)).width, 1920);
  });
  await test("community frame survives reload and remote sharing", async (page) => {
    const name = "Community E2E " + Date.now();
    await unlockFrameUpload(page);
    await page.getByLabel("Upload frame PNG", { exact: true }).setInputFiles({
      name: name + ".png",
      mimeType: "image/png",
      buffer: frame(),
    });
    // Single collection: the upload yields exactly one tile in the reel.
    await until(
      () => page.getByRole("button", { name, exact: true }).count(),
      (n) => n === 1,
    );
    await page.getByRole("button", { name: "Tanpa", exact: true }).click();
    await page.getByRole("button", { name, exact: true }).first().click();
    await until(
      () =>
        page
          .getByRole("button", { name, exact: true })
          .first()
          .getAttribute("aria-pressed"),
      (v) => v === "true",
    );
    const source = await page
      .getByTestId("booth-preview")
      .locator("img[aria-hidden]")
      .getAttribute("src");
    await until(
      () => draft(page),
      (d) => d?.f === source,
    );
    await page.reload();
    await expandPanels(
      page,
      page.getByRole("button", { name: "Hapus frame custom", exact: true }),
    );
    await page
      .getByRole("button", { name: "Hapus frame custom", exact: true })
      .waitFor({ timeout: 5000 });
    assert.ok((await draft(page)).f, "community frame was dropped from draft");
    await fillPhoto(page);
    await page
      .locator("header")
      .getByRole("button", { name: "Bagikan", exact: true })
      .click();
    const field = page.getByRole("textbox", { name: "Link share" });
    await field.waitFor({ timeout: 30000 });
    const url = await field.inputValue();
    assert.ok(url.includes("/s/"));
    const id = new URL(url).pathname.split("/").pop();
    const p = await (await fetch(api + "/v1/designs/" + id)).json();
    assert.ok(p.f, "community frame dropped from share payload");
    const image = await pngInfo(
      Buffer.from(
        await (
          await fetch(api + "/v1/designs/" + id + "/og.png")
        ).arrayBuffer(),
      ),
    );
    assert.ok(image.pixel(5, 5)[1] > 100, "community frame absent from OG");
    await page.getByRole("button", { name: "Tutup", exact: true }).click();
    // The access code from the unlock is still held in this session.
    const collection = await (await fetch(api + "/v1/frames")).json();
    const originalFrame = collection.frames.find(
      (entry) => entry.name === name,
    );
    assert.ok(originalFrame);
    await page
      .getByRole("button", {
        name: `Hapus ${name} dari koleksi komunitas`,
        exact: true,
      })
      .click();
    await until(
      () => page.getByRole("button", { name, exact: true }).count(),
      (n) => n === 0,
    );
    assert.equal((await fetch(originalFrame.imageUrl)).status, 404);
    assert.equal(
      (await draft(page)).f,
      source,
      "deleting the collection entry changed the selected frame",
    );
    const snapshot = await pngInfo(
      await download(
        page,
        page
          .locator("header")
          .getByRole("button", { name: "Download PNG", exact: true }),
      ),
    );
    assert.ok(
      snapshot.pixel(5, 5)[1] > 100,
      "deleted community frame lost from PNG export",
    );
  });
  await test("builtin frame appears in server OG image", async (page) => {
    await page.getByRole("button", { name: "Polaroid", exact: true }).click();
    await fillPhoto(page);
    await page
      .locator("header")
      .getByRole("button", { name: "Bagikan", exact: true })
      .click();
    const f = page.getByRole("textbox", { name: "Link share" });
    await f.waitFor({ timeout: 30000 });
    const id = new URL(await f.inputValue()).pathname.split("/").pop();
    const image = await pngInfo(
      Buffer.from(
        await (
          await fetch(api + "/v1/designs/" + id + "/og.png")
        ).arrayBuffer(),
      ),
    );
    const p = image.pixel(2, 2);
    assert.ok(
      p[0] > 200 && p[1] > 200,
      "Polaroid white border absent from OG: " + p,
    );
  });
  await test("share viewer, QR, deletion, and offline fallback", async (page, context) => {
    await fillPhoto(page);
    await page
      .locator("header")
      .getByRole("button", { name: "Bagikan", exact: true })
      .click();
    const f = page.getByRole("textbox", { name: "Link share" });
    await f.waitFor({ timeout: 30000 });
    const url = await f.inputValue();
    const viewer = await context.newPage();
    await viewer.goto(url);
    await viewer.getByRole("link", { name: "Buka di editor" }).waitFor();
    await page.getByRole("button", { name: "Perbesar QR code" }).click();
    await page.getByRole("dialog", { name: "QR code besar" }).waitFor();
    await page.keyboard.press("Escape");
    assert.equal(
      await page.getByRole("dialog", { name: "QR code besar" }).count(),
      0,
    );
    await page.getByRole("button", { name: "Hapus dari server" }).click();
    await page
      .getByText("Link telah dihapus dari server.", { exact: false })
      .waitFor();
    assert.equal(
      (
        await fetch(
          api + "/v1/designs/" + new URL(url).pathname.split("/").pop(),
        )
      ).status,
      404,
    );
    await page.getByRole("button", { name: "Tutup", exact: true }).click();
    await page.route(api + "/v1/designs", (route) => route.abort());
    await page
      .locator("header")
      .getByRole("button", { name: "Bagikan", exact: true })
      .click();
    await f.waitFor({ timeout: 30000 });
    assert.ok((await f.inputValue()).includes("#d="));
  });
  await test(
    "mobile share dialog fits viewport and traps keyboard focus",
    async (page) => {
      await fillPhoto(page);
      await page
        .locator("header")
        .getByRole("button", { name: "Bagikan", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "Link share" })
        .waitFor({ timeout: 30000 });
      const closeBox = await page
        .getByRole("button", { name: "Tutup", exact: true })
        .boundingBox();
      assert.ok(
        closeBox.y >= 0,
        "close button clipped above viewport: " + JSON.stringify(closeBox),
      );
      const del = page.getByRole("button", { name: "Hapus dari server" });
      await del.scrollIntoViewIfNeeded();
      const b = await del.boundingBox();
      assert.ok(
        b.y >= 0 && b.y + b.height <= 568,
        "delete button outside mobile viewport: " + JSON.stringify(b),
      );
      await page.getByRole("button", { name: "Tutup", exact: true }).focus();
      await page.keyboard.press("Shift+Tab");
      assert.ok(
        await page
          .getByRole("dialog", { name: "Bagikan", exact: true })
          .evaluate((el) => el.contains(document.activeElement)),
        "keyboard focus escaped modal",
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        "horizontal page overflow",
      );
    },
    { viewport: { width: 320, height: 568 } },
  );
  await test("camera capture, pause, retake, and confirmation", async (page) => {
    await page.getByRole("button", { name: "1 Foto", exact: true }).click();
    await page
      .getByRole("button", { name: "Buka kamera", exact: true })
      .click();
    const start = page.getByRole("button", { name: "Mulai sesi · 1 foto" });
    await until(() => start.isEnabled(), Boolean, 15000);
    await start.click();
    await page.getByRole("button", { name: "Jeda", exact: false }).click();
    await page.getByRole("button", { name: "Lanjutkan sesi" }).click();
    await page
      .getByRole("button", { name: "Pakai semua" })
      .waitFor({ timeout: 20000 });
    assert.equal((await draft(page)).s[0][0], null);
    await page
      .getByRole("button", { name: "Ulangi foto 1", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Pakai semua" })
      .waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Pakai semua" }).click();
    await until(
      () => draft(page),
      (d) => d?.s[0][0]?.startsWith("data:image/jpeg"),
    );
    const before = (await draft(page)).s[0][0];
    await page
      .getByRole("button", { name: "Buka kamera", exact: true })
      .click();
    await page.getByRole("button", { name: "Tutup sesi foto" }).click();
    assert.equal((await draft(page)).s[0][0], before);
  });

  await test("portrait custom frames reject four photo windows", async (page) => {
    await page.getByRole("button", { name: "Portrait 9:16" }).click();
    await until(
      () => draft(page),
      (d) => d?.r === "9:16",
    );
    await unlockFrameUpload(page);
    const c = createCanvas(1080, 1920);
    const x = c.getContext("2d");
    x.fillStyle = "#22aa44";
    x.fillRect(0, 0, 1080, 1920);
    for (let i = 0; i < 4; i++) x.clearRect(40, 40 + i * 470, 1000, 430);
    await page.getByLabel("Upload frame PNG", { exact: true }).setInputFiles({
      name: "four-windows.png",
      mimeType: "image/png",
      buffer: c.encodeSync("png"),
    });
    await until(() => page.getByRole("status").textContent(), Boolean);
    assert.ok(
      !(await draft(page)).f?.startsWith("data:image/png"),
      "four-window portrait frame was applied",
    );
    assert.match(
      await page.getByRole("status").textContent(),
      /1.?3|maksimal 3|maks.*3/i,
    );
  });
  await test("late photo upload does not undo new design reset", async (page) => {
    await page.evaluate(() => {
      const original = FileReader.prototype.readAsDataURL;
      FileReader.prototype.readAsDataURL = function (blob) {
        setTimeout(() => original.call(this, blob), 1000);
      };
    });
    await page
      .getByRole("group", { name: "Foto 1", exact: true })
      .locator("input[type=file]")
      .setInputFiles({
        name: "slow.png",
        mimeType: "image/png",
        buffer: photo("#2222cc"),
      });
    await page
      .locator("header")
      .getByRole("button", { name: "Mulai baru" })
      .click();
    await page.waitForTimeout(1800);
    assert.equal(
      (await draft(page)).s[0][0],
      null,
      "an old upload overwrote the reset design",
    );
  });
  await test("older share request cannot replace a newer link", async (page) => {
    await fillPhoto(page);
    let count = 0;
    let releaseFirst;
    let firstArrived;
    const firstSeen = new Promise((r) => (firstArrived = r));
    const gate = new Promise((r) => (releaseFirst = r));
    await page.route(api + "/v1/designs", async (route) => {
      const n = ++count;
      if (n === 1) {
        firstArrived();
        await gate;
      }
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        headers: { "access-control-allow-origin": base },
        body: JSON.stringify({
          id: n === 1 ? "OldLink1" : "NewLink2",
          url: base + "/s/" + (n === 1 ? "OldLink1" : "NewLink2"),
          expiresAt: Math.floor(Date.now() / 1000) + 86400,
          deleteToken: "fixture",
        }),
      });
    });
    await page
      .locator("header")
      .getByRole("button", { name: "Bagikan", exact: true })
      .click();
    await firstSeen;
    await page.getByRole("button", { name: "Tutup", exact: true }).click();
    await page
      .locator("header")
      .getByRole("button", { name: "Bagikan", exact: true })
      .click();
    const f = page.getByRole("textbox", { name: "Link share" });
    await f.waitFor({ timeout: 30000 });
    assert.ok((await f.inputValue()).endsWith("/NewLink2"));
    releaseFirst();
    await page.waitForTimeout(800);
    assert.ok(
      (await f.inputValue()).endsWith("/NewLink2"),
      "earlier request replaced the current share link",
    );
  });

  await test(
    "mobile empty slot camera and upload controls remain visible",
    async (page) => {
      await page.getByRole("button", { name: "4 Foto", exact: true }).click();
      const slot = page.getByRole("group", { name: "Foto 4", exact: true });
      await slot.scrollIntoViewIfNeeded();
      const box = await slot.boundingBox();
      for (const name of ["Kamera", "Upload"]) {
        const b = await slot
          .getByRole("button", { name, exact: true })
          .boundingBox();
        assert.ok(
          b.y >= box.y &&
            b.y + b.height <= box.y + box.height &&
            b.x >= box.x &&
            b.x + b.width <= box.x + box.width,
          name + " is clipped inside its slot",
        );
      }
    },
    { viewport: { width: 320, height: 568 } },
  );
  await test("frame upload failure is reported honestly", async (page) => {
    await page.evaluate(() => {
      const original = window.fetch;
      window.fetch = async (input, init) => {
        if (
          String(input).endsWith("/v1/frames") &&
          init?.method === "POST"
        )
          return new Response("{}", { status: 500 });
        return original(input, init);
      };
    });
    await unlockFrameUpload(page);
    await page.getByLabel("Upload frame PNG", { exact: true }).setInputFiles({
      name: "quota-frame.png",
      mimeType: "image/png",
      buffer: frame(),
    });
    await until(
      () => page.getByRole("status").textContent(),
      (t) => /gagal/i.test(t || ""),
    );
    assert.ok(
      !(await draft(page)).f?.startsWith("data:image/png"),
      "frame was applied despite the failed upload",
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem("selfie-booth:frames:v1")),
      null,
    );
  });
  await test("camera denial keeps editor usable", async (page) => {
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException("denied", "NotAllowedError");
      };
    });
    await page
      .getByRole("button", { name: "Buka kamera", exact: true })
      .click();
    await page.getByText(/Izin kamera ditolak/).waitFor();
    assert.equal(
      await page.getByRole("button", { name: /Mulai sesi/ }).isDisabled(),
      true,
    );
    await page.getByRole("button", { name: "Tutup sesi foto" }).click();
    await fillPhoto(page);
    assert.ok((await draft(page)).s[0][0]);
  });
  await test("camera fills only empty slots in a multi-photo session", async (page) => {
    await fillPhoto(page, 0, "#22cc22");
    const before = (await draft(page)).s[0][0];
    await page
      .getByRole("button", { name: "Buka kamera", exact: true })
      .click();
    const start = page.getByRole("button", { name: "Mulai sesi · 2 foto" });
    await until(() => start.isEnabled(), Boolean, 15000);
    await start.click();
    await page
      .getByRole("button", { name: "Pakai semua" })
      .waitFor({ timeout: 25000 });
    await page.getByRole("button", { name: "Pakai semua" }).click();
    await until(
      () => draft(page),
      (d) => d?.s[1][0] && d?.s[2][0],
    );
    assert.equal((await draft(page)).s[0][0], before);
    assert.equal((await draft(page)).s[3][0], null);
  });
  assert.ok(results.length > 0, "No E2E cases matched E2E_FILTER");
  await fs.writeFile(
    path.join(out, "report.json"),
    JSON.stringify(results, null, 2),
  );
  console.log(
    JSON.stringify({
      passed: results.filter((x) => x.status === "passed").length,
      failed: results.filter((x) => x.status === "failed").length,
    }),
  );
  if (results.some((x) => x.status === "failed")) process.exitCode = 1;
})()
  .catch(async (e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(cleanup);
