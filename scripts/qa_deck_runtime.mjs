import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const input = process.argv[2];
if (!input) throw new Error("usage: node scripts/qa_deck_runtime.mjs <url-or-html-path>");
const targetUrl = /^https?:\/\//.test(input) ? input : pathToFileURL(path.resolve(input)).href;

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function pollJson(url) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Chrome DevTools did not become ready: ${url}`);
}

const port = await freePort();
const profile = await fs.mkdtemp(path.join(os.tmpdir(), "rib-runtime-qa-"));
const browser = spawn(chrome, [
  "--headless=new",
  "--disable-gpu",
  "--disable-background-networking",
  "--disable-component-update",
  "--no-first-run",
  "--remote-allow-origins=*",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "--window-size=1600,900",
  targetUrl,
], { stdio: "ignore" });

let socket;
try {
  const targets = await pollJson(`http://127.0.0.1:${port}/json/list`);
  const target = targets.find((item) => item.type === "page");
  if (!target) throw new Error("No Chrome page target found");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  const runtimeErrors = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") {
      runtimeErrors.push(message.params?.exceptionDetails?.text || "Runtime exception");
    }
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression, awaitPromise = false) => {
    const result = await cdp("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || expression);
    return result.result.value;
  };

  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1600, height: 900, deviceScaleFactor: 1, mobile: false,
  });
  await cdp("Page.navigate", { url: targetUrl });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate("document.readyState") === "complete") break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  const total = await evaluate("document.querySelectorAll('.slide').length");
  const initial = await evaluate("Number(document.querySelector('.slide.active')?.dataset.slide || 0)");
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))");
    if (await evaluate("Number(document.querySelector('.slide.active')?.dataset.slide || 0)") > initial) break;
  }
  const afterArrow = await evaluate("Number(document.querySelector('.slide.active')?.dataset.slide || 0)");
  if (total < 2 || initial !== 1 || afterArrow <= initial) {
    throw new Error(`Keyboard paging failed: total=${total}, initial=${initial}, after=${afterArrow}`);
  }

  const timerSlide = await evaluate("Number(document.querySelector('[data-timer]')?.closest('.slide')?.dataset.slide || 0)");
  if (!timerSlide) throw new Error("No configured timer found");
  await evaluate(`show(${timerSlide})`);
  const timerBefore = await evaluate("document.querySelector('.slide.active [data-timer]')?.textContent.trim()");
  await new Promise((resolve) => setTimeout(resolve, 1250));
  const timerAfter = await evaluate("document.querySelector('.slide.active [data-timer]')?.textContent.trim()");
  if (!timerBefore || timerBefore === timerAfter) {
    throw new Error(`Timer did not decrement: ${timerBefore} -> ${timerAfter}`);
  }

  let sorterReport = null;
  const sorterSlide = await evaluate("Number(document.querySelector('[data-w7-sorter]')?.dataset.slide || 0)");
  if (sorterSlide) {
    await evaluate(`show(${sorterSlide}); document.getElementById('w7-sort-reset').click()`);
    const order = async () => await evaluate("document.getElementById('w7-rank-list')?.dataset.order || ''");
    const changeOne = async (id, value) => {
      await evaluate(`(() => {
        document.getElementById('w7-sort-reset').click();
        const control = document.getElementById(${JSON.stringify(id)});
        control.value = ${JSON.stringify(value)};
        control.dispatchEvent(new Event('change', { bubbles:true }));
      })()`);
      return await order();
    };

    const observed = {
      baseline: await order(),
      history: await changeOne("w7-sort-history", "quick"),
      location: await changeOne("w7-sort-location", "west"),
      dwell: await changeOne("w7-sort-goal", "dwell"),
      paid: await changeOne("w7-sort-goal", "paid"),
    };
    const expected = {
      baseline: "ACBDE",
      history: "BCADE",
      location: "AEBCD",
      dwell: "BACDE",
      paid: "DABCE",
    };
    for (const [key, expectedOrder] of Object.entries(expected)) {
      if (observed[key] !== expectedOrder) {
        throw new Error(`W7 sorter ${key} order mismatch: ${observed[key]} != ${expectedOrder}`);
      }
    }

    const singleChangeStatus = await evaluate("document.getElementById('w7-sort-status')?.textContent || ''");
    if (!singleChangeStatus.includes("你只改了：排序目標")) {
      throw new Error(`W7 sorter single-change status failed: ${singleChangeStatus}`);
    }
    const multiChangeStatus = await evaluate(`(() => {
      document.getElementById('w7-sort-reset').click();
      for (const [id, value] of [['w7-sort-history','quick'], ['w7-sort-location','west']]) {
        const control = document.getElementById(id);
        control.value = value;
        control.dispatchEvent(new Event('change', { bubbles:true }));
      }
      return document.getElementById('w7-sort-status').textContent;
    })()`);
    if (!multiChangeStatus.includes("一次改了 2 項")) {
      throw new Error(`W7 sorter multi-change warning failed: ${multiChangeStatus}`);
    }

    const navigationGuard = await evaluate(`(() => {
      document.getElementById('w7-sort-reset').click();
      const before = Number(document.querySelector('.slide.active')?.dataset.slide || 0);
      document.querySelector('#w7-rank-list .sorter-row').click();
      const afterCardClick = Number(document.querySelector('.slide.active')?.dataset.slide || 0);
      const select = document.getElementById('w7-sort-history');
      select.focus();
      select.dispatchEvent(new KeyboardEvent('keydown', { key:'ArrowRight', bubbles:true }));
      const afterSelectKey = Number(document.querySelector('.slide.active')?.dataset.slide || 0);
      return { before, afterCardClick, afterSelectKey };
    })()`);
    if (
      navigationGuard.before !== sorterSlide
      || navigationGuard.afterCardClick !== sorterSlide
      || navigationGuard.afterSelectKey !== sorterSlide
    ) {
      throw new Error(`W7 sorter navigation guard failed: ${JSON.stringify(navigationGuard)}`);
    }

    const sorterBounds = await evaluate(`(() => [${sorterSlide}, ${sorterSlide + 1}].map(number => {
      show(number);
      const rect = document.querySelector('.slide.active .slide-inner').getBoundingClientRect();
      return { number, top:rect.top, bottom:rect.bottom, viewport:innerHeight };
    }))()`);
    const clipped = sorterBounds.find(item => item.top < 42 || item.bottom > item.viewport - 42);
    if (clipped) throw new Error(`W7 sorter projection bounds failed: ${JSON.stringify(sorterBounds)}`);
    sorterReport = { slide: sorterSlide, observed, navigationGuard, sorterBounds };
  }

  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
  });
  await evaluate("updateRotateHint(); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))", true);
  const rotateHint = await evaluate("document.getElementById('rotateHint')?.classList.contains('visible') || false");
  if (!rotateHint) throw new Error("Portrait-phone rotate hint is not visible");
  if (runtimeErrors.length) throw new Error(`Runtime errors: ${runtimeErrors.join(' | ')}`);

  console.log(JSON.stringify({
    url: targetUrl,
    totalSlides: total,
    arrowRight: `${initial}->${afterArrow}`,
    timer: `${timerBefore}->${timerAfter}`,
    sorter: sorterReport,
    portraitRotateHint: rotateHint,
    runtimeErrors: runtimeErrors.length,
  }));
  await cdp("Browser.close");
} finally {
  if (socket && socket.readyState === WebSocket.OPEN) socket.close();
  if (!browser.killed) browser.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 200));
  try {
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {}
}
