# Profile Refresher: Chrome Extension Plan

A Chrome extension that keeps a Naukri profile "recently updated" by making a small, invisible edit **10–20 times a day**. It runs inside the user's own browser, using the Naukri login they already have.

> Working name: **Profile Refresher**. Naukri's name and logo are deliberately not in the product name (see §12).

---

## 1. Goal and scope

**Goal:** after a one-time install and a normal Naukri login, the user's profile shows "updated today" every day, with no further action.

**In scope (v1)**
- Toggle a trailing `.` on the Resume Headline (the method already proven in `D:\AutoUpdate`).
- Read back what Naukri stored after every update.
- 10–20 updates a day, configurable, spread across the user's active hours.
- Catch-up when the browser opens after being closed.
- Popup with status, plus a settings page.
- Clear alerts when the user is logged out or something breaks.

**Out of scope (v1)**
- Updating while the computer is off. A browser extension can't do this (§3).
- Storing passwords, OTPs or anything on a server. There is no server.
- Mobile browsers (no extension support).
- Naukrigulf and other job sites.
- AI features (planned for later, §14).

---

## 2. What the user does

| Step | Once or ongoing |
|---|---|
| Install the extension from the Chrome Web Store | Once |
| Be logged in to naukri.com in that browser | Once (again only if logged out) |
| Choose updates per day (10–20) and active hours, or keep the defaults | Once, optional |
| Open the browser on most days | Ongoing (normal usage) |

The user never gives the extension a password or OTP. If the Naukri session ends, the extension shows a red badge and a notification asking them to log in again.

---

## 3. Honest constraints

| Constraint | Effect | Mitigation |
|---|---|---|
| Runs only while the computer is on and Chrome is running | No updates while off or asleep | Catch-up update within ~1 minute of the browser starting. Optionally, Chrome's "continue running background apps" setting (Windows) |
| 10–20 automated edits a day | Looks more bot-like than 1–5. A small but real risk of Naukri flagging the account | Random timing (jitter), only during active hours, a hard cap of 20, auto-pause on any warning sign (§8). Default 10 |
| Naukri terms forbid automation | The Web Store could remove the extension if Naukri complains | No trademark use, no data collection, single purpose, clear disclosure to the user |
| Naukri changes its website | Updates fail until the extension is fixed | Selectors in one config file, failure alerts, a quick fix released through the Web Store (auto-updates users) |
| Session expiry | Updates stop until the user logs in | Logged-out detection, badge and notification |

---

## 4. Architecture

Everything runs locally in the browser. There is no backend.

```
┌──────────────────────── Chrome (user's own browser) ────────────────────────┐
│                                                                              │
│  Service worker (background.js)                                              │
│   ├─ Scheduler: chrome.alarms → next run time (with jitter)                  │
│   ├─ Runner: lock → open hidden tab → inject updater → verify → close tab    │
│   ├─ State: chrome.storage.local (settings, history, counters)               │
│   └─ Alerts: badge text/colour + chrome.notifications                        │
│                     │ chrome.scripting.executeScript                         │
│                     ▼                                                        │
│  Content script (updater.js) running on naukri.com/mnjuser/profile           │
│   ├─ detect: logged in? blocked? CAPTCHA?                                    │
│   ├─ open headline editor → toggle "." → Save                                │
│   └─ reload → re-read stored headline → report result                        │
│                                                                              │
│  Popup (popup.html)          Options page (options.html)                     │
│   status, last/next run,      updates per day, active hours,                 │
│   "Update now", pause         notifications, history, reset                  │
└──────────────────────────────────────────────────────────────────────────────┘
        Uses the user's existing naukri.com cookies. No passwords, no server.
```

### 4.1 How an update is performed

**Primary method (v1): the real Naukri page in a background tab.**
1. Create an **inactive** tab (`active: false`) for `https://www.naukri.com/mnjuser/profile`. The user's current tab stays in focus. The tab is closed within about 20 seconds.
2. Inject `updater.js`, which performs the same steps as the proven Python bot:
   - find the Resume Headline section → edit
   - toggle the trailing `.` → Save
   - reload → reopen → confirm the stored value
3. Return a result: `ok | logged_out | blocked | layout_changed | not_saved | error`.

**Alternative (Phase 0 spike, possible v2): Naukri's internal web API.** The Naukri site saves the headline through an internal HTTP request. Calling it directly from the extension, with the user's cookies, would need no tab at all, and it would be faster and invisible. It's undocumented and may need tokens or headers taken from the page, so it's evaluated in Phase 0. It ships only if it proves stable. **The DOM method stays as the fallback.**

---

## 5. Scheduling design

### 5.1 Settings
| Setting | Default | Allowed |
|---|---|---|
| Updates per day | **10** | 10–20 (hard cap 20) |
| Active hours | 08:00–22:00 local time | Any window of ≥ 4 hours |
| Minimum gap between runs | 30 min | Fixed (enforced) |
| Paused | Off | On/off |

### 5.2 Daily plan
- At the start of each day (or the first browser start of the day), build a list of run times:
  - Divide the active window into N equal slots.
  - Pick a **random time inside each slot**, so the timing never looks like a clock.
  - Enforce the 30-minute minimum gap.
- Store the plan in `chrome.storage.local`, then set a single `chrome.alarms` alarm for the next slot. After each run, schedule the next one.
- Chrome may clear alarms on restart, so the plan is **rebuilt from storage** on `runtime.onStartup` and `runtime.onInstalled`.

### 5.3 Catch-up rules
- **Browser starts and there's no successful update today yet:** run one update after 1–2 minutes (randomised), then continue with the remaining slots.
- **Missed slots while the computer was off:** **skipped, not replayed.** Replaying would cause a burst of edits, which is the most bot-like pattern possible.
- **Computer wakes from sleep with an overdue alarm:** at most one run, then continue the plan.

### 5.4 Overlap lock
- A run sets `runLock = {startedAt}` in storage.
- Any run that finds a lock younger than 2 minutes exits.
- This prevents double runs, for example from an alarm and "Update now" at the same moment.

---

## 6. Update logic (content script)

Built from the selectors that already work in `D:\AutoUpdate\naukri_update.py`:

| Step | Detail |
|---|---|
| Page check | Title "Access Denied" → `blocked`. URL contains `nlogin`/`login` → `logged_out`. CAPTCHA element present → `blocked` |
| Find section | `.widgetHead` with text "Resume headline" → wait up to 20 s, else `layout_changed` |
| Edit | Click the `.edit` icon inside the section → wait for `#resumeHeadlineTxt` |
| Toggle | If the text ends with `.`, remove it. Otherwise add `.`. Set the value **and** dispatch `input`/`change` events, so the page's framework registers the edit |
| Save | Click the button named "Save" → wait about 3 s |
| Verify | Reload → reopen the editor → compare the stored text with the expected text. A mismatch means `not_saved` |
| Last-updated text | Read the "Profile last updated …" text if present, for the popup |

All selectors live in **`src/selectors.js`**, so a Naukri layout change means editing one file.

---

## 7. User interface

### 7.1 Toolbar badge
| Badge | Meaning |
|---|---|
| *(none)* | Working normally |
| `12` | Updates done today (optional setting) |
| 🔴 `!` | Needs attention: logged out, blocked or layout changed |
| ⏸ | Paused |

### 7.2 Popup
- Status line, e.g. "✅ Profile updated 3 min ago (7 of 10 today)"
- Next update time
- **Update now** button (respects the lock and the 30-minute gap; shows the reason if blocked)
- **Pause / Resume**
- Link to settings

### 7.3 Options page
- Updates per day (slider, 10–20) with a risk note shown above 10
- Active hours (from/to)
- Notifications on/off (failures only / every update)
- History: the last 50 runs with time, result and message
- "Reset all data"

### 7.4 Notifications
- Logged out: "Log in to Naukri to resume updates" → click opens naukri.com
- Blocked or CAPTCHA: "Updates paused: Naukri showed a security check. Open Naukri and complete it, then click Resume."
- Layout changed: "Naukri changed its page. An extension update is needed."

---

## 8. Safety and anti-flagging rules

1. **Hard cap of 20 updates a day**, enforced in code, not just the UI.
2. **Random timing** inside each slot, with a 30-minute minimum gap.
3. **No bursts:** missed runs are never replayed.
4. **Auto-pause** for 24 hours on `blocked` (Access Denied or CAPTCHA), with a notification. Updates never retry into a security check.
5. **Back-off on errors:** after 3 consecutive failures, pause until the next day and notify.
6. **The real page with the real user's session:** no fake headers, no spoofing.
7. **Only the headline's trailing `.` is ever changed.** The extension never edits any other profile data.

---

## 9. Data and privacy

| Data | Stored where | Leaves the browser? |
|---|---|---|
| Settings | `chrome.storage.local` | No |
| Run history (time, result, short message) | `chrome.storage.local`, last 50 | No |
| Headline text | Read during a run only, never stored | No |
| Passwords / OTP | **Never seen** | — |
| Analytics | **None in v1** | — |

The Chrome Web Store requires a privacy policy, a one-page "we collect nothing, everything stays in your browser" statement hosted on GitHub Pages.

---

## 10. Permissions (manifest.json, Manifest V3)

| Permission | Why |
|---|---|
| `alarms` | Schedule updates |
| `storage` | Settings, plan, history |
| `scripting` | Inject the updater into the Naukri profile tab |
| `notifications` | Logged-out, blocked and failure alerts |
| Host: `https://www.naukri.com/*` | Open and update the profile page |

No `tabs`, `cookies`, `<all_urls>` or `history` permissions. Fewer permissions mean a faster store review and more user trust.

---

## 11. Project structure

```
D:\NaukriProfileRefresher\
├── PLAN.md                  ← this document
├── manifest.json
├── src/
│   ├── background.js        service worker: scheduler, runner, alerts
│   ├── scheduler.js         pure functions: build daily plan, next slot, catch-up rules
│   ├── updater.js           content script injected into the profile page
│   ├── selectors.js         every Naukri selector in one place
│   ├── storage.js           typed wrappers over chrome.storage
│   ├── popup.html / popup.js / popup.css
│   └── options.html / options.js / options.css
├── icons/                   16/32/48/128 px
├── tests/
│   ├── scheduler.test.js    unit tests (node:test, no dependencies)
│   ├── fixtures/profile.html  saved copy of the profile page structure
│   └── updater.test.js      runs updater.js against the fixture (jsdom)
├── store/                   Web Store listing text, screenshots, privacy policy
└── .gitignore
```

**Tech choices**
- Plain JavaScript (ES modules), **no build step.** It's simpler to debug and review, and the extension can be loaded "unpacked" directly from the folder.
- Tests use Node's built-in `node:test` runner plus `jsdom` for the content-script tests.
- No frameworks in the popup or options pages. They're small.

---

## 12. Chrome Web Store publishing

| Item | Detail |
|---|---|
| Developer account | One-time **US $5** fee |
| Name | "Profile Refresher – keep your job profile fresh", with **no Naukri logo or name in the title or icon**. The description may say it works with naukri.com |
| Single purpose statement | "Keeps the user's job-portal profile marked as recently updated" |
| Permission justifications | One line each (§10) |
| Privacy policy | URL required (GitHub Pages) |
| Review time | Usually a few days |
| Updates | Upload a new version. Chrome auto-updates all users within hours |

---

## 13. Delivery phases

| Phase | Work | Output / exit criteria |
|---|---|---|
| **0. Spike** (½ day) | Save the profile page HTML as a test fixture. Inspect the network request Naukri sends when saving the headline. Decide DOM vs API | Fixture saved. Decision noted in this plan |
| **1. Core update** (1–2 days) | `manifest.json`, `updater.js`, `selectors.js`, background "Update now" path, verification | Click "Update now" → headline toggles → verified → Naukri shows "updated today" |
| **2. Scheduler** (1–2 days) | `scheduler.js` with unit tests, alarms, catch-up, lock, caps | Tests pass. Over a day with 10/day the history shows 10 spaced runs |
| **3. UI and alerts** (1–2 days) | Popup, options, badge, notifications, history | All states in §7 visible. Logged-out flow tested by logging out |
| **4. Hardening** (1 day) | Auto-pause, back-off, the "Access Denied"/CAPTCHA paths, edge cases (Naukri tab already open, slow network) | Each failure path tested by hand |
| **5. Dogfood** (3–7 days) | Use it on your own account at 10/day | No flags or warnings from Naukri. Few or no failures in history |
| **6. Publish** (1 day + review) | Icons, screenshots, listing, privacy policy, upload | Listed on the Chrome Web Store |

**Total:** about 1–2 weeks of part-time work, plus the dogfood period and store review.

---

## 14. Later (v2+)

- **Resume re-upload mode** (the user picks the file once; the extension stores it locally).
- **API-based update** (no tab), if the Phase 0 spike shows it's stable.
- **AI features:**
  - headline and summary suggestions from the user's resume
  - keyword match against target job descriptions

  These are run by the user and approved by the user before anything changes. They can't run by themselves, and they need an AI API key or a paid plan.
- **Edge Add-ons store** listing (same code).
- **Firefox** version (minor API differences).

---

## 15. Test plan

| Area | How |
|---|---|
| Scheduler logic | Unit tests: N slots within the window, 30-minute gap, cap of 20, catch-up once, no replay after downtime, crossing midnight, DST/timezone |
| Updater against a fixture | jsdom tests on a saved profile page: toggle adds/removes `.`, missing section → `layout_changed`, login page → `logged_out`, "Access Denied" title → `blocked` |
| Real Naukri | Manual checklist on your own account: update now, scheduled run, logged-out alert, browser restart catch-up, sleep/wake, pause/resume |
| Store readiness | Load the unpacked extension in a fresh Chrome profile, check that only the declared permissions are requested |

---

## 16. Open decisions

| # | Question | Default if not decided |
|---|---|---|
| 1 | Default updates per day: 10, or allow starting at 20? | **10**, with the user able to raise it to 20 |
| 2 | Active hours default | **08:00–22:00** |
| 3 | DOM vs API method | Decided in Phase 0. **DOM** unless the API is clearly stable |
| 4 | Separate GitHub repo for this project? | Yes, a new **private** repo until publishing |
| 5 | Product name | "Profile Refresher" (working name) |
