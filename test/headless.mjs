// Headless smoke test: instant overlay, background AI + cache, account wall.
// Run: node test/headless.mjs
import { JSDOM } from 'jsdom';
import fs from 'fs';

const html = `<!DOCTYPE html><html><body>
<form onsubmit="return false">
  <div><label for="f">First Name *</label><input type="text" id="f" name="first_name"></div>
  <div><label for="e">Email Address *</label><input type="email" id="e" name="email"></div>
  <div><label for="w">Why are you interested in this role?</label><textarea id="w" name="why_interested"></textarea></div>
  <div><label for="hack">What is your favorite productivity hack?</label><textarea id="hack" name="productivity_hack"></textarea></div>
  <div><label for="p1">Create Password *</label><input type="password" id="p1" name="password"></div>
  <div><label for="p2">Verify New Password *</label><input type="password" id="p2" name="confirm_password"></div>
</form>
</body></html>`;

const dom = new JSDOM(html, { url: 'https://acme.example.com/apply', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;

// jsdom has no layout: make everything "visible"
window.HTMLElement.prototype.getBoundingClientRect = function () {
  return { width: 120, height: 24, top: 10, left: 10, right: 130, bottom: 34, x: 10, y: 10 };
};
Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', { get() { return window.document.body; } });
window.scrollTo = () => {};

const storage = {
  qaAccountEmail: 'tanmay@uni.example.edu',
  qaAccountPassword: 'dummy-pw-1',
  qaAccounts: {},
};
const listeners = [];
let aiCalls = 0;

window.chrome = {
  runtime: {
    lastError: undefined,
    sendMessage(msg, cb) {
      let resp = {};
      let delay = 1;
      if (msg.type === 'isEnabled') resp = true;
      else if (msg.type === 'getSettings') resp = { enabled: true, extensionEnabled: true, aiEnabled: true, hasApiKey: true, activeProfileId: 'p1', autoScan: false };
      else if (msg.type === 'getActiveProfile') resp = 'p1';
      else if (msg.type === 'getProfile') resp = {
        profile_id: 'p1', name: 'Tanmay Maka', first_name: 'Tanmay', last_name: 'Maka',
        email: 'tanmay@example.com', fields: {}, answers: { why_interested: 'Saved essay answer.' }, cover_letter_snippets: [],
      };
      else if (msg.type === 'getLearnedMappings') resp = [];
      else if (msg.type === 'aiAnswerQuestion') { aiCalls++; resp = { answer: 'MOCK CLAUDE: timebox deep work.' }; delay = 500; }
      else if (msg.type === 'aiMatch') { aiCalls++; resp = { answer: 'Yes', confidence: 0.8, field_key: 'mock' }; delay = 500; }
      setTimeout(() => cb && cb(resp), delay);
    },
    onMessage: { addListener(fn) { listeners.push(fn); } },
  },
  storage: {
    local: {
      get(keys, cb) {
        const keyList = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys || storage);
        const r = {};
        keyList.forEach(k => { if (k in storage) r[k] = storage[k]; });
        if (cb) cb(r);
        return Promise.resolve(r);
      },
      set(obj, cb) { Object.assign(storage, obj); if (cb) cb(); return Promise.resolve(); },
    },
  },
};

const code = fs.readFileSync(new URL('../dist/content.js', import.meta.url), 'utf8');
window.eval(code);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } console.log('ok  :', msg); };

await sleep(30); // let init finish

// --- Scan: overlay must appear instantly, long before AI (500ms mock) resolves ---
const t0 = Date.now();
listeners.forEach(fn => fn({ type: 'scan' }, {}, () => {}));
const doc = window.document;
let overlayMs = null;
while (Date.now() - t0 < 400) {
  if (doc.getElementById('jobright-overlay')) { overlayMs = Date.now() - t0; break; }
  await sleep(5);
}
assert(overlayMs !== null && overlayMs < 300, `overlay appeared in ${overlayMs}ms — before AI (500ms) resolves`);
assert(doc.querySelectorAll('.qa-card[data-pending-id]').length >= 1, 'unknown essay shows a pending "Claude is writing" card, not blocking');
assert(doc.getElementById('jr-status-note').textContent.includes('Claude is writing'), 'status shows Claude writing');

// Local matches present immediately (first name + saved essay from answers bank)
const cards = doc.querySelectorAll('.qa-card[data-index]');
assert(cards.length >= 5, `local suggestions rendered immediately (${cards.length})`);

// Account wall: password + confirm + email use stored credentials, masked
const texts = Array.from(cards).map(c => c.textContent);
assert(texts.some(t => t.includes('••••••••••')), 'password suggestion is masked');
assert(texts.filter(t => t.includes('••••••••••')).length === 2, 'both password + confirm password covered');
assert(texts.some(t => t.includes('account')), 'credential cards labeled with account source');

// --- Fill all ---
doc.getElementById('jr-fill-all').click();
await sleep(10);
assert(doc.getElementById('f').value === 'Tanmay', 'first name filled');
assert(doc.getElementById('e').value === 'tanmay@uni.example.edu', 'email uses ACCOUNT email on account-wall page');
assert(doc.getElementById('p1').value === 'dummy-pw-1', 'password filled from store');
assert(doc.getElementById('p2').value === 'dummy-pw-1', 'confirm password filled');
assert(doc.getElementById('w').value === 'Saved essay answer.', 'essay from answers bank (no AI call needed)');
assert(storage.qaAccounts['acme.example.com'], 'company account registered after credential fill');

// --- Background AI resolves and caches ---
await sleep(700);
assert(doc.querySelectorAll('.qa-card[data-pending-id]').length === 0, 'pending card resolved');
assert(storage.qaAnswerCache && Object.values(storage.qaAnswerCache).some(v => v.value.includes('MOCK CLAUDE')), 'AI answer cached');
const aiCallsFirst = aiCalls;
assert(aiCallsFirst >= 1, `AI called for the new question (${aiCallsFirst} call)`);

// --- Second scan: cached answer is instant, no new AI call ---
const oldOverlay = doc.getElementById('jobright-overlay');
const t1 = Date.now();
listeners.forEach(fn => fn({ type: 'scan' }, {}, () => {}));
let rebuildMs = null;
while (Date.now() - t1 < 500) {
  const cur = doc.getElementById('jobright-overlay');
  if (cur && cur !== oldOverlay) { rebuildMs = Date.now() - t1; break; }
  await sleep(5);
}
assert(rebuildMs !== null && rebuildMs < 300, `second scan overlay rebuilt in ${rebuildMs}ms`);
assert(doc.querySelectorAll('.qa-card[data-pending-id]').length === 0, 'second scan: nothing pending — cache hit');
const cardTexts2 = Array.from(window.document.querySelectorAll('.qa-card[data-index]')).map(c => c.textContent.replace(/\s+/g,' ').trim()).join(' | '); console.log('CARDS2:', cardTexts2);
assert(cardTexts2.includes('Claude · cached'), 'cached answer shown instantly with cached source');
assert(aiCalls === aiCallsFirst, 'no new AI calls on second scan');

console.log('\nALL PASS');
process.exit(0);
