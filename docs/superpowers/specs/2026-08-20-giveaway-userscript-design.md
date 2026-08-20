# Giveaway Userscript Design

**Date:** 2026-08-20

## Goal

Make the existing userscript reliably participate in the site's official free-token giveaway on both the main domain and localized subdomains, including `vi.celebjihad.live`.

## Scope

The script may interact only with the visible giveaway UI already rendered by the page:

- Open the giveaway panel when it is collapsed.
- Locate the official participation button inside the giveaway panel.
- Click it once when the account has not entered the current giveaway.
- Confirm the page reports a successful entry before showing a success notification.

The script will not read or derive authentication tokens, call private endpoints, modify balances, bypass payment, create accounts, or evade rate limits and eligibility rules.

## Current Context

The repository contains one userscript, `celebjihad-plus.js`. The current implementation uses a five-second interval, assumes English confirmation text, reports success immediately after calling `.click()`, and matches only `https://celebjihad.live/*`. The current Vietnamese page renders the giveaway under `.lottery` and the official button as `.lottery-participation .btn-auth-banner`.

## Proposed Behavior

### Page matching

Add metadata matches for the apex domain and subdomains so localized pages are supported. The script must remain inactive on unrelated domains.

### Detection and state

Use a small idempotent controller with these states:

1. `waiting`: giveaway markup is not available yet.
2. `opening`: the giveaway exists but is collapsed; click its title button once.
3. `ready`: the panel is open and the official participation button is visible and enabled.
4. `attempted`: a click was issued; wait for the DOM to report an outcome.
5. `entered`: the page shows a localized success/entered message; stop for the current page lifecycle.
6. `cooldown`: an attempt did not produce confirmation; retry only after a bounded delay.

Run an initial scan, observe `document.body` with `MutationObserver`, and keep a low-frequency polling fallback for countdown and SPA updates. Each scan must be cheap and must not produce repeated logs or notifications.

### Robust selectors

Prefer stable giveaway classes over page-wide text matches:

- Container: `.lottery`
- Expand/collapse control: `.lottery-title-wrapper`
- Participation area: `.lottery-participation`
- Official action: `.lottery-participation .btn-auth-banner`

Validate the action's normalized text against localized free-token/giveaway labels before clicking so unrelated auth banners are never activated.

### Outcome confirmation

Treat an attempt as successful only when the giveaway subtree contains a localized entered/registered/participated confirmation or the site's equivalent success marker. A click alone is not success. If confirmation is absent, retain a bounded retry cooldown and avoid rapid repeated clicks.

### Notifications and logging

Render one dismissible, `aria-live` notification using `textContent` rather than `innerHTML`. Notify only for confirmed entry, a clear signed-out/auth requirement, or a final retry failure. Use a namespaced console prefix and suppress duplicate messages.

## Non-Functional Requirements

- No network requests or storage of credentials/tokens.
- No automatic interaction outside the giveaway subtree.
- Safe when the page is still loading, when the giveaway is already entered, and when markup is absent.
- No unbounded timers, duplicate observers, or repeated success notifications.
- Preserve the userscript's single-file distribution format.

## Verification

Because the repository has no test runner, verification will use focused static and DOM-fixture checks:

- Parse the userscript with Node's syntax checker.
- Check metadata contains the apex and localized/subdomain matches.
- Exercise the pure DOM helpers against fixtures for collapsed, ready, entered, and absent states.
- Verify a click is issued at most once before confirmation and that success notification is delayed until confirmation.
- Run `git diff --check` and inspect the final diff for unrelated changes.

## File Impact

- Modify: `celebjihad-plus.js`
- Add: `docs/superpowers/specs/2026-08-20-giveaway-userscript-design.md`
- Add during planning/verification only if needed: focused local test/fixture files; do not introduce a general framework for this one-file script.
