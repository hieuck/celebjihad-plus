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
  assert.equal(normalizeText('  L\u1ea4Y   TOKEN Mi\u1ec5N Ph\u00ed  '), '\u004c\u1ea5y token mi\u1ec5n ph\u00ed'.toLocaleLowerCase());
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
