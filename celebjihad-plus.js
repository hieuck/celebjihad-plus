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
      '\u0111\u00e3 tham gia r\u00fat th\u0103m token',
      '\u0111\u00e3 \u0111\u0103ng k\u00fd giveaway',
      '\u0111\u00e3 \u0111\u0103ng k\u00fd r\u00fat th\u0103m',
      '\u0111\u00e3 \u0111\u0103ng k\u00fd r\u00fat th\u0103m token',
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

  function isAuthRequired(documentRef) {
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
    if (notification.__celebjihadTimer) {
      windowRef.clearTimeout(notification.__celebjihadTimer);
    }
    notification.__celebjihadTimer = windowRef.setTimeout(() => notification.remove(), 4500);
  }

  function createController(options = {}) {
    const documentRef = options.document || root.document;
    const windowRef = options.window || root;
    const logger = options.logger || windowRef.console || { log() {} };
    const notify = options.notify || ((message) => showNotification(documentRef, windowRef, message));
    const now = options.now || (() => Date.now());
    const setTimeoutRef = options.setTimeout
      || (typeof windowRef.setTimeout === 'function' ? windowRef.setTimeout.bind(windowRef) : setTimeout);
    const clearTimeoutRef = options.clearTimeout
      || (typeof windowRef.clearTimeout === 'function' ? windowRef.clearTimeout.bind(windowRef) : clearTimeout);
    const setIntervalRef = options.setInterval
      || (typeof windowRef.setInterval === 'function' ? windowRef.setInterval.bind(windowRef) : setInterval);
    const clearIntervalRef = options.clearInterval
      || (typeof windowRef.clearInterval === 'function' ? windowRef.clearInterval.bind(windowRef) : clearInterval);
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
      if (typeof logger.log === 'function') logger.log(`${CONFIG.logPrefix} ${message}`);
    }

    function scheduleScan(delay = 0) {
      if (state.scanTimer !== null) return;
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
          notify(isAuthRequired(documentRef)
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
      if (state.pollTimer !== null) clearIntervalRef(state.pollTimer);
      if (state.scanTimer !== null) clearTimeoutRef(state.scanTimer);
      state.observer = null;
      state.pollTimer = null;
      state.scanTimer = null;
      state.started = false;
    }

    return {
      getState: () => ({
        phase: state.phase,
        attempts: state.attempts,
        confirmationDeadline: state.confirmationDeadline,
        nextActionAt: state.nextActionAt,
        successNotified: state.successNotified,
        started: state.started,
      }),
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
    isAuthRequired,
    isEntryConfirmed,
    isFreeTokenAction,
    isGiveawayOpen,
    normalizeText,
    startWhenReady,
  };
}));
