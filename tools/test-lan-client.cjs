// Lightweight WebUI behavior checks. No browser automation or load tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../crates/host/src/lan.html'), 'utf8');
const body = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(body, 'HTML must contain a client script');

function makeElement() {
  const listeners = {};
  return {
    hidden: true,
    listeners,
    addEventListener(type, cb) { listeners[type] = cb; },
  };
}

function makeClient(sourceWidth, sourceHeight, box, options = {}) {
  const handlers = {};
  const winListeners = {};
  const docListeners = {};
  let captured = null;
  let fullscreenEl = null;
  const viewer = {
    getBoundingClientRect: () => box,
    setPointerCapture: id => { captured = id; },
    hasPointerCapture: id => captured === id,
    releasePointerCapture: id => { if (captured === id) captured = null; },
    addEventListener: (type, callback) => { handlers[type] = callback; },
  };
  const mirror = { src: '' };
  const status = { textContent: '', hidden: false };
  const fsBtn = makeElement();
  const enterGate = makeElement();
  const enterBtn = makeElement();
  const rootEl = {
    dataset: {},
    requestFullscreen: options.fullscreen === false ? undefined : async () => {
      if (options.rejectFullscreen) throw new Error('denied');
      fullscreenEl = rootEl;
    },
  };
  let lockCalledWith = null;
  class Socket {
    static OPEN = 1;
    constructor(url) { this.url = url; this.readyState = 1; this.sent = []; Socket.latest = this; }
    send(value) { this.sent.push(JSON.parse(value)); }
  }
  const win = {
    innerWidth: box.width,
    innerHeight: box.height,
    addEventListener: (type, cb) => { winListeners[type] = cb; },
  };
  const context = {
    document: {
      documentElement: rootEl,
      get fullscreenElement() { return fullscreenEl; },
      getElementById: id => ({ viewer, mirror, status, 'fs-btn': fsBtn, 'enter-gate': enterGate, 'enter-btn': enterBtn })[id],
      addEventListener: (type, cb) => { docListeners[type] = cb; },
    },
    window: win,
    screen: {
      orientation: options.orientationLock === false ? {} : {
        lock: async mode => {
          lockCalledWith = mode;
          if (options.rejectOrientation) throw new Error('NotSupportedError');
        },
      },
    },
    navigator: {},
    location: { host: '192.168.1.50:8765', search: '?token=123456' },
    performance: { now: (() => { let t = 0; return () => t += 18; })() },
    URLSearchParams,
    WebSocket: Socket,
    setTimeout: () => {},
    setInterval: () => {},
  };
  const script = body.replace('__SOURCE_WIDTH__', String(sourceWidth)).replace('__SOURCE_HEIGHT__', String(sourceHeight));
  vm.runInNewContext(
    script + '\nglobalThis.check = {contentRect, coordinates, isRotated, enterFullscreenAndLandscape, getLock: () => lockCalledWith};',
    context,
  );
  return {
    handlers,
    win,
    winListeners,
    docListeners,
    viewer,
    mirror,
    status,
    fsBtn,
    enterGate,
    enterBtn,
    rootEl,
    check: context.check,
    getLockedOrientation: () => lockCalledWith,
    socket: Socket.latest,
  };
}
function near(a, b) { assert.ok(Math.abs(a - b) < 0.0001, `${a} != ${b}`); }
function point(x, y, id = 7) { return { clientX: x, clientY: y, pointerId: id, button: 0, preventDefault: () => {} }; }

// 1. Standard landscape
let client = makeClient(1280, 720, { left: 0, top: 0, width: 1600, height: 900 });
assert.equal(client.check.isRotated(), false);
assert.equal(client.enterGate.hidden, false);
let c = client.check.coordinates(point(800, 450));
near(c.x, 0.5); near(c.y, 0.5);
client.handlers.pointerdown(point(800, 450));
client.handlers.pointermove(point(960, 540));
client.handlers.pointerup(point(960, 540));
assert.deepEqual(client.socket.sent.map(e => e.type), ['down', 'move', 'up']);
near(client.socket.sent[1].x, 0.6); near(client.socket.sent[1].y, 0.6);

// 2. Portrait viewport forces 90deg clockwise CSS landscape and transforms coordinates
client = makeClient(1280, 720, { left: 0, top: 0, width: 400, height: 900 });
assert.equal(client.check.isRotated(), true);
const portraitRect = client.check.contentRect();
near(portraitRect.left, 94.44444);
near(portraitRect.width, 711.11111);
near(portraitRect.height, 400);
// Top black bar of rotated 16:9 area (clientY = 20 is in the left margin of rotated landscape)
client.handlers.pointerdown(point(200, 20));
assert.equal(client.socket.sent.length, 0, 'do not click in forced-landscape black bar');
// Center of portrait screen maps to center (0.5, 0.5)
const portraitCenter = client.check.coordinates(point(200, 450));
near(portraitCenter.x, 0.5); near(portraitCenter.y, 0.5);
// Physical top-right edge (clientX=400, clientY=94.444) -> rotated top-left (0, 0)
const rotatedTopLeft = client.check.coordinates(point(400, 94.44444));
near(rotatedTopLeft.x, 0); near(rotatedTopLeft.y, 0);
// Physical bottom-left edge (clientX=0, clientY=805.555) -> rotated bottom-right (1, 1)
const rotatedBottomRight = client.check.coordinates(point(0, 805.55556));
near(rotatedBottomRight.x, 1); near(rotatedBottomRight.y, 1);

// Holding a touch when orientation flips cancels the active gesture
client.handlers.pointerdown(point(200, 450));
client.win.innerWidth = 900;
client.win.innerHeight = 400;
client.winListeners.resize();
assert.equal(client.socket.sent.at(-1).type, 'cancel');
assert.equal(client.check.isRotated(), false);

// 3. Android click gesture activates fullscreen + landscape lock
(async () => {
  const android = makeClient(1280, 720, { left: 0, top: 0, width: 400, height: 900 });
  assert.equal(android.enterGate.hidden, false);
  await android.check.enterFullscreenAndLandscape();
  assert.equal(android.enterGate.hidden, true);
  assert.equal(android.getLockedOrientation(), 'landscape');
  assert.equal(android.fsBtn.hidden, true);
  // Exiting fullscreen later reveals the corner re-enter button
  await android.rootEl.requestFullscreen(); // already fullscreen
  // Simulate browser exiting fullscreen
  android.win.innerWidth = 400;
  android.win.innerHeight = 900;
  const androidWithExit = makeClient(1280, 720, { left: 0, top: 0, width: 400, height: 900 }, { rejectFullscreen: true });
  await androidWithExit.check.enterFullscreenAndLandscape();
  assert.equal(androidWithExit.enterGate.hidden, true);
  assert.equal(androidWithExit.fsBtn.hidden, false);

  // 4. iOS Safari (no requestFullscreen, no orientation.lock): skips gate, forces CSS landscape
  const ios = makeClient(1280, 720, { left: 0, top: 0, width: 390, height: 844 }, {
    fullscreen: false,
    orientationLock: false,
  });
  assert.equal(ios.enterGate.hidden, true);
  assert.equal(ios.fsBtn.hidden, true);
  assert.equal(ios.check.isRotated(), true);

  // 5. 4:3 letterbox + pointercancel + URL check
  const letter = makeClient(1024, 768, { left: 0, top: 0, width: 1600, height: 900 });
  const rect = letter.check.contentRect();
  near(rect.left, 200); near(rect.width, 1200); near(rect.height, 900);
  letter.handlers.pointerdown(point(200, 450));
  near(letter.socket.sent[0].x, 0); near(letter.socket.sent[0].y, 0.5);
  letter.handlers.pointercancel(point(200, 450));
  assert.equal(letter.socket.sent[1].type, 'cancel');
  assert.ok(letter.mirror.src.includes('/stream?token=123456'));
  assert.ok(letter.socket.url.includes('/ws?token=123456'));
  console.log('PASS: WebUI syntax, fullscreen gate, forced 90deg landscape, iOS fallback, 4:3 letterbox, cancel, URLs');
})();
