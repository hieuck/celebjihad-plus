# Giveaway Userscript Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the userscript join the site's official free-token giveaway reliably on the apex domain and localized subdomains without reading tokens or bypassing the site's controls.

**Architecture:** Keep the distribution as one browser userscript, but wrap the logic in a small factory so pure DOM helpers and the controller can be tested by Node. The controller scans the `.lottery` subtree, opens it when collapsed, clicks only the localized official free-token action, waits for a confirmed success marker, and uses bounded retries with a cooldown.

**Tech Stack:** Tampermonkey/Violentmonkey userscript metadata, browser DOM APIs, `MutationObserver`, and Node's built-in `node:test` runner.

---

### Task 1: Add failing DOM/controller tests

**Files:**
- Create: `celebjihad-plus.test.js`
- Read: `celebjihad-plus.js`

- [x] **Step 1: Write the failing test**

Create `celebjihad-plus.test.js` with this complete fixture and test set:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CONFIG,
  createController,
  findParticipationButton,
  isEntryConfirmed,
  isFreeTokenAction,
  isGiveawayOpen,
  isAuthRequired,
  normalizeText,
} = require('./celebjihad-plus.js');

function createClassList(names = []) {
  const values = new Set(names);
  return {
    contains(name) {
      return values.has(name);
    },
    add(name) {
      values.add(name);
    },
  };
}

function createElement({
  kind = '',
  text = '',
  classes = [],
  attrs = {},
  children = [],
  disabled = false,
} = {}) {
  return {
    kind,
    tagName: 'BUTTON',
    textContent: text,
    classList: createClassList(classes),
    disabled,
    clickCount: 0,
    click() {
      this.clickCount += 1;
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    querySelector(selector) {
      if (selector === '.lottery-participation .btn-auth-banner') {
        return children.find((child) => child.kind === 'action') || null;
      }
      if (selector === '.lottery-title-wrapper') {
        return children.find((child) => child.kind === 'title') || null;
      }
      if (selector === '.lottery-participation') {
        return children.find((child) => child.kind === 'participation') || null;
      }
      if (selector.includes('.lottery-item') || selector.includes('data-status')) {
        return children.find((child) => child.kind === 'marker') || null;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'button') {
        return children.filter((child) => child.tagName === 'BUTTON');
      }
      return [];
    },
  };
}

function createGiveawayFixture({ open = true, confirmed = false } = {}) {
  let entryConfirmed = confirmed;
  const title = createElement({
    kind: 'title',
    classes: ['lottery-title-wrapper', ...(open ? ['active'] : [])],
    attrs: { 'aria-expanded': String(open) },
  });
  const action = createElement({
    kind: 'action',
    text: '\u004c\u1ea5y token mi\u1ec5n ph\u00ed',
    classes: ['btn', 'btn-auth-banner'],
  });
  const participation = createElement({ kind: 'participation', children: [action] });
  const giveaway = {
    classList: createClassList(['lottery', ...(open ? ['open'] : [])]),
    get textContent() {
      return entryConfirmed
        ? '\u0110\u00e3 tham gia giveaway token.'
        : '\u004c\u1ea5y token mi\u1ec5n ph\u00ed';
    },
    querySelector(selector) {
      if (selector === CONFIG.titleSelector) return title;
      if (selector === CONFIG.actionSelector) return action;
      if (selector === '.lottery-participation') return participation;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'button') return [title, action];
      return [];
    },
  };
  const document = {
    body: {},
    querySelector(selector) {
      return selector === CONFIG.giveawaySelector ? giveaway : null;
    },
  };
  return {
    action,
    document,
    giveaway,
    setConfirmed(value) {
      entryConfirmed = value;
    },
    title,
  };
}

test('normalizes giveaway text before matching', () => {
  assert.equal(normalizeText('  L\u1ea4Y   TOKEN Mi\u1ec5N Ph\u00ed  '), '\u004c\u1ea5y token mi\u1ec5n ph\u00ed');
});

test('recognizes the official Vietnamese free-token action only', () => {
  const action = createElement({ text: '\u004c\u1ea5y token mi\u1ec5n ph\u00ed' });
  const purchase = createElement({ text: 'Nh\u1eadn gi\u1ea3m gi\u00e1' });
  assert.equal(isFreeTokenAction(action), true);
  assert.equal(isFreeTokenAction(purchase), false);
});

test('detects giveaway open state and confirmed entry', () => {
  const fixture = createGiveawayFixture({ open: true, confirmed: true });
  assert.equal(isGiveawayOpen(fixture.giveaway), true);
  assert.equal(isEntryConfirmed(fixture.giveaway), true);
});

test('detects an authentication dialog without treating normal giveaway text as auth', () => {
  const fixture = createGiveawayFixture();
  const dialog = { textContent: '\u0110\u0103ng nh\u1eadp \u0111\u1ec3 ti\u1ebfp t\u1ee5c' };
  const document = { querySelector: () => dialog };
  assert.equal(isAuthRequired(document, fixture.giveaway), true);
});

test('finds the action inside the giveaway participation subtree', () => {
  const fixture = createGiveawayFixture();
  assert.equal(findParticipationButton(fixture.giveaway), fixture.action);
});

test('clicks once and waits for page confirmation before reporting success', () => {
  const fixture = createGiveawayFixture();
  const notifications = [];
  let clock = 0;
  const controller = createController({
    document: fixture.document,
    window: {},
    now: () => clock,
    notify: (message) => notifications.push(message),
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
  });

  controller.scan();
  controller.scan();
  assert.equal(fixture.action.clickCount, 1);
  assert.equal(notifications.length, 0);

  fixture.setConfirmed(true);
  clock = 100;
  controller.scan();
  assert.equal(controller.getState().phase, 'entered');
  assert.equal(notifications.length, 1);
});

test('opens a collapsed giveaway before clicking its action', () => {
  const fixture = createGiveawayFixture({ open: false });
  const controller = createController({
    document: fixture.document,
    window: {},
    now: () => 0,
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
  });

  controller.scan();
  assert.equal(fixture.title.clickCount, 1);
  assert.equal(fixture.action.clickCount, 0);
});
```

- [x] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test celebjihad-plus.test.js
```

Expected: FAIL because the current userscript does not export `normalizeText`, `createController`, or the DOM helpers. Do not modify production code until this failure is observed.

### Task 2: Implement the testable userscript controller

**Files:**
- Modify: `celebjihad-plus.js`

- [x] **Step 1: Replace the legacy interval implementation with the tested module shape**

Replace the file with the following complete implementation. Keep the metadata comments at the top and do not add network requests, token parsing, credential storage, or balance manipulation:

```js
// ==UserScript==
// @name         CelebJihad Free Token Giveaway Helper
// @namespace    https://github.com/hieuck/celebjihad-plus
// @version      2.0.0
// @description  Join the official free-token giveaway once and report confirmed status.
// @match        https://celebjihad.live/*
// @match        https://*.celebjihad.live/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=celebjihad.live
// @grant        none
// ==/UserScript==

(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
    return;
  }
  api.startWhenReady();
}(typeof globalThis === 'object' ? globalThis : window, function (root) {
  'use strict';

  const CONFIG = Object.freeze({
    giveawaySelector: '.lottery',
    titleSelector: '.lottery-title-wrapper',
    participationSelector: '.lottery-participation',
    actionSelector: '.lottery-participation .btn-auth-banner',
    actionLabels: [
      '\u004c\u1ea5y token mi\u1ec5n ph\u00ed',
      'nh\u1eadn token mi\u1ec5n ph\u00ed',
      'get free token',
      'get free tokens',
      'token giveaway',
      'participate in giveaway',
      'join giveaway',
    ],
    successLabels: [
      'you have entered the token giveaway',
      'already entered the token giveaway',
      'entry confirmed',
      'participation confirmed',
      '\u0111\u00e3 tham gia giveaway',
      '\u0111\u00e3 tham gia r\u00fat th\u0103m',
      '\u0111\u00e3 \u0111\u0103ng k\u00fd giveaway',
      '\u0111\u00e3 \u0111\u0103ng k\u00fd r\u00fat th\u0103m',
    ],
    authLabels: ['sign in', 'log in', 'login required', '\u0111\u0103ng nh\u1eadp'],
    confirmationTimeoutMs: 8000,
    retryCooldownMs: 15000,
    maxAttempts: 2,
    pollIntervalMs: 2500,
    notificationId: 'celebjihad-plus-notification',
    logPrefix: '[celebjihad-plus]',
  });

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
  }

  function includesAny(value, labels) {
    const normalized = normalizeText(value);
    return labels.some((label) => normalized.includes(normalizeText(label)));
  }

  function isVisible(element) {
    if (!element || element.hidden || element.disabled) return false;
    if (element.getAttribute && element.getAttribute('aria-disabled') === 'true') return false;
    if (element.getAttribute && element.getAttribute('aria-hidden') === 'true') return false;
    if (typeof element.getClientRects === 'function' && element.getClientRects().length === 0) return false;
    return true;
  }

  function isFreeTokenAction(element) {
    return Boolean(element && isVisible(element) && includesAny(element.textContent, CONFIG.actionLabels));
  }

  function isGiveawayOpen(giveaway) {
    if (!giveaway) return false;
    const title = giveaway.querySelector ? giveaway.querySelector(CONFIG.titleSelector) : null;
    return Boolean(
      giveaway.classList?.contains('open')
      || title?.classList?.contains('active')
      || title?.getAttribute?.('aria-expanded') === 'true'
    );
  }

  function isEntryConfirmed(giveaway) {
    if (!giveaway) return false;
    const marker = giveaway.querySelector?.(
      '.lottery-item .accept, .lottery-registered, [data-status=entered], [data-status=registered]'
    );
    if (marker && includesAny(marker.textContent, CONFIG.successLabels)) return true;
    return includesAny(giveaway.textContent, CONFIG.successLabels);
  }

  function isAuthRequired(documentRef, giveaway) {
    const dialog = documentRef?.querySelector?.('[role=dialog], .auth-modal, .login-modal');
    return Boolean(dialog && includesAny(dialog.textContent, CONFIG.authLabels));
  }

  function findParticipationButton(giveaway) {
    if (!giveaway?.querySelector) return null;
    const direct = giveaway.querySelector(CONFIG.actionSelector);
    if (isFreeTokenAction(direct)) return direct;

    const participation = giveaway.querySelector(CONFIG.participationSelector);
    const candidates = participation?.querySelectorAll?.('button') || giveaway.querySelectorAll?.('button') || [];
    return Array.from(candidates).find((candidate) => isFreeTokenAction(candidate)) || null;
  }

  function showNotification(documentRef, windowRef, message) {
    if (!documentRef?.body || !documentRef.createElement) return;
    let notification = documentRef.getElementById?.(CONFIG.notificationId);
    if (!notification) {
      notification = documentRef.createElement('div');
      notification.id = CONFIG.notificationId;
      notification.setAttribute('role', 'status');
      notification.setAttribute('aria-live', 'polite');
      notification.style.cssText = [
        'position:fixed',
        'right:20px',
        'bottom:20px',
        'z-index:2147483647',
        'max-width:320px',
        'padding:10px 14px',
        'border-radius:6px',
        'background:#111',
        'color:#fff',
        'font:14px/1.4 sans-serif',
        'box-shadow:0 4px 16px rgba(0,0,0,.35)',
      ].join(';');
      documentRef.body.appendChild(notification);
    }
    notification.textContent = message;
    if (notification.__celebjihadTimer) windowRef.clearTimeout(notification.__celebjihadTimer);
    notification.__celebjihadTimer = windowRef.setTimeout(() => notification.remove(), 4500);
  }

  function createController(options = {}) {
    const documentRef = options.document || root.document;
    const windowRef = options.window || root;
    const logger = options.logger || windowRef.console || { log() {} };
    const notify = options.notify || ((message) => showNotification(documentRef, windowRef, message));
    const now = options.now || (() => Date.now());
    const setTimeoutRef = options.setTimeout || windowRef.setTimeout?.bind(windowRef) || setTimeout;
    const clearTimeoutRef = options.clearTimeout || windowRef.clearTimeout?.bind(windowRef) || clearTimeout;
    const setIntervalRef = options.setInterval || windowRef.setInterval?.bind(windowRef) || setInterval;
    const clearIntervalRef = options.clearInterval || windowRef.clearInterval?.bind(windowRef) || clearInterval;
    const state = {
      phase: 'waiting',
      attempts: 0,
      confirmationDeadline: 0,
      nextActionAt: 0,
      successNotified: false,
      started: false,
      observer: null,
      pollTimer: null,
      scanTimer: null,
    };

    function log(message) {
      logger.log(`${CONFIG.logPrefix} ${message}`);
    }

    function scheduleScan(delay = 0) {
      if (state.scanTimer) return;
      state.scanTimer = setTimeoutRef(() => {
        state.scanTimer = null;
        scan();
      }, delay);
    }

    function scan() {
      const giveaway = documentRef?.querySelector?.(CONFIG.giveawaySelector);
      if (!giveaway) {
        state.phase = 'waiting';
        return;
      }

      if (isEntryConfirmed(giveaway)) {
        state.phase = 'entered';
        if (!state.successNotified) {
          state.successNotified = true;
          notify('\u0110\u00e3 tham gia giveaway token mi\u1ec5n ph\u00ed.');
        }
        return;
      }

      if (state.phase === 'entered') {
        state.phase = 'waiting';
        state.attempts = 0;
        state.confirmationDeadline = 0;
        state.nextActionAt = 0;
        state.successNotified = false;
      }

      if (!isGiveawayOpen(giveaway)) {
        const title = giveaway.querySelector?.(CONFIG.titleSelector);
        if (isVisible(title) && typeof title.click === 'function') {
          state.phase = 'opening';
          title.click();
          log('opened giveaway panel');
          scheduleScan(250);
        }
        return;
      }

      const currentTime = now();
      if (state.phase === 'attempted') {
        if (currentTime < state.confirmationDeadline) return;
        if (state.attempts >= CONFIG.maxAttempts) {
          state.phase = 'failed';
          notify(isAuthRequired(documentRef, giveaway)
            ? '\u0110\u0103ng nh\u1eadp tr\u01b0\u1edbc khi tham gia giveaway token.'
            : '\u004b\u00f4ng th\u1ec3 x\u00e1c nh\u1eadn l\u01b0\u1ee3t tham gia giveaway.');
          return;
        }
        state.phase = 'cooldown';
        state.nextActionAt = currentTime + CONFIG.retryCooldownMs;
        return;
      }

      if (state.phase === 'failed' || (state.phase === 'cooldown' && currentTime < state.nextActionAt)) return;

      const action = findParticipationButton(giveaway);
      if (!action || state.attempts >= CONFIG.maxAttempts) return;

      state.phase = 'attempted';
      state.attempts += 1;
      state.confirmationDeadline = currentTime + CONFIG.confirmationTimeoutMs;
      action.click();
      log(`clicked official giveaway action (attempt ${state.attempts})`);
      scheduleScan(CONFIG.confirmationTimeoutMs);
    }

    function start() {
      if (state.started || !documentRef?.body) return;
      state.started = true;
      scan();
      if (windowRef.MutationObserver) {
        state.observer = new windowRef.MutationObserver(() => scheduleScan());
        state.observer.observe(documentRef.body, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ['class', 'aria-expanded', 'aria-disabled', 'disabled'],
        });
      }
      state.pollTimer = setIntervalRef(scan, CONFIG.pollIntervalMs);
    }

    function stop() {
      state.observer?.disconnect();
      if (state.pollTimer) clearIntervalRef(state.pollTimer);
      if (state.scanTimer) clearTimeoutRef(state.scanTimer);
      state.observer = null;
      state.pollTimer = null;
      state.scanTimer = null;
      state.started = false;
    }

    return {
      getState: () => ({ ...state, observer: undefined, pollTimer: undefined, scanTimer: undefined }),
      scan,
      start,
      stop,
    };
  }

  function startWhenReady() {
    if (!root.document) return null;
    const controller = createController({ document: root.document, window: root });
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', () => controller.start(), { once: true });
    } else {
      controller.start();
    }
    return controller;
  }

  return {
    CONFIG,
    createController,
    findParticipationButton,
    isEntryConfirmed,
    isFreeTokenAction,
    isGiveawayOpen,
    isAuthRequired,
    normalizeText,
    startWhenReady,
  };
}));
```

- [x] **Step 2: Run the focused tests to verify the implementation passes**

Run:

```powershell
node --test celebjihad-plus.test.js
```

Expected: PASS for all six tests with no unhandled timer or syntax errors.

### Task 3: Run static and repository verification

**Files:**
- Verify: `celebjihad-plus.js`
- Verify: `celebjihad-plus.test.js`
- Verify: `docs/superpowers/specs/2026-08-20-giveaway-userscript-design.md`

- [x] **Step 1: Check JavaScript syntax**

Run:

```powershell
node --check celebjihad-plus.js
node --check celebjihad-plus.test.js
```

Expected: both commands exit with code `0` and print no errors.

- [x] **Step 2: Check metadata and forbidden behavior**

Run:

```powershell
rg -n @match|@version|fetch\(|XMLHttpRequest|GM_xmlhttpRequest|localStorage|sessionStorage|token[A-Za-z]*[=:] celebjihad-plus.js
```

Expected: both domain match lines and the new version are present; no network request or token-storage code is present.

- [x] **Step 3: Check patch hygiene and rerun tests**

Run:

```powershell
git diff --check
git status --short
node --test celebjihad-plus.test.js
```

Expected: `git diff --check` is silent, only the intended userscript/test/spec files are changed, and all tests pass.

Do not create a commit unless the user explicitly requests one.

## Plan Self-Review

- Page matching is covered by the two `@match` entries in Task 2.
- DOM-only interaction is enforced by the `.lottery` selectors and absence of network APIs.
- Locale support is covered by escaped Vietnamese and English labels.
- Duplicate clicks are covered by the controller state and the controller test.
- Success is delayed until `isEntryConfirmed` returns true and is covered by the controller test.
- Loading/collapsed states are covered by the waiting/opening logic and collapsed fixture test.
- Static syntax, metadata, forbidden behavior, and diff hygiene are covered by Task 3.
- The plan has no dependency on a package install or a new test framework.
