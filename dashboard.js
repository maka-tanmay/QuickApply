// QuickApply Tracker dashboard — renders real application data in the lime/dark design.

let allApps = [];
let currentFilter = 'all';
let selectedId = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadProfileGreeting();
  await loadApplications();
  setupListeners();
});

function esc(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function initials(name) {
  return (name || '?').split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
}

function timeAgo(ts) {
  if (!ts) return '';
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

async function loadProfileGreeting() {
  try {
    const settings = await chrome.runtime.sendMessage({ type: 'getSettings' });
    let firstName = '';
    if (settings?.activeProfileId) {
      const profile = await chrome.runtime.sendMessage({ type: 'getProfile', profileId: settings.activeProfileId });
      firstName = profile?.first_name || (profile?.name || '').split(' ')[0] || '';
      document.getElementById('me-initials').textContent = initials(profile?.name);
    }
    const hour = new Date().getHours();
    const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    document.getElementById('greeting').textContent = firstName ? `Good ${part}, ${firstName}` : `Good ${part}`;
  } catch (e) {
    console.error('greeting error', e);
  }
}

async function loadApplications() {
  try {
    allApps = (await chrome.runtime.sendMessage({ type: 'getApplications' })) || [];
  } catch (e) {
    console.error('apps error', e);
    allApps = [];
  }
  allApps.sort((a, b) => (b.updatedAt || b.appliedAt || 0) - (a.updatedAt || a.appliedAt || 0));

  renderStats();
  renderNextUp();
  renderPipeline();
  renderList();
  if (allApps.length > 0 && !selectedId) selectedId = allApps[0].id;
  renderDetail();
}

function renderStats() {
  const now = Date.now();
  const weekMs = 7 * 24 * 3600 * 1000;
  const monthApps = allApps.filter(a => now - (a.appliedAt || 0) < 30 * 24 * 3600 * 1000 && a.status !== 'saved');
  const weekApps = allApps.filter(a => now - (a.appliedAt || 0) < weekMs && a.status !== 'saved');
  const applied = allApps.filter(a => a.status !== 'saved');

  document.getElementById('stat-week').textContent = weekApps.length;
  document.getElementById('stat-total-sub').textContent = `of ${applied.length} total`;
  document.getElementById('greeting-sub').textContent = applied.length > 0
    ? `${monthApps.length} application${monthApps.length === 1 ? '' : 's'} this month. Every one filled in under two minutes.`
    : 'Your applications, tracked automatically.';

  // Week dots: one per day, lit if any application that day
  const dots = document.getElementById('week-dots');
  dots.innerHTML = '';
  for (let d = 6; d >= 0; d--) {
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const start = dayStart.getTime() - d * 24 * 3600 * 1000;
    const count = allApps.filter(a => (a.appliedAt || 0) >= start && (a.appliedAt || 0) < start + 24 * 3600 * 1000).length;
    const dot = document.createElement('span');
    dot.className = 'week-dot' + (count >= 2 ? ' full' : count === 1 ? ' part' : '');
    dots.appendChild(dot);
  }

  // Response rate: anything that moved past "applied"
  const heardBack = applied.filter(a => ['interviewing', 'offered', 'rejected'].includes(a.status));
  const rate = applied.length ? Math.round((heardBack.length / applied.length) * 100) : 0;
  const interviews = applied.filter(a => a.status === 'interviewing').length;
  document.getElementById('stat-response').textContent = rate;
  document.getElementById('stat-response-sub').textContent = applied.length
    ? `${heardBack.length} of ${applied.length} heard back · ${interviews} in interviews`
    : 'No responses yet';

  // Follow-ups due: quiet for 10+ days while still "applied"
  const due = applied.filter(a => a.status === 'applied' && now - (a.appliedAt || 0) > 10 * 24 * 3600 * 1000);
  document.getElementById('stat-followups').textContent = due.length;
}

function renderNextUp() {
  const upcoming = [];
  allApps.forEach(a => {
    (a.interviews || []).forEach(i => {
      if (i.date && i.date > Date.now()) upcoming.push({ when: i.date, label: `${a.company} — interview`, sub: a.position });
    });
    (a.followUps || []).forEach(f => {
      if (f.date && f.date > Date.now()) upcoming.push({ when: f.date, label: `${a.company} — follow up`, sub: a.position });
    });
  });
  upcoming.sort((a, b) => a.when - b.when);
  if (upcoming.length > 0) {
    const next = upcoming[0];
    const when = new Date(next.when).toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' });
    document.getElementById('nextup-title').textContent = `${next.label}, ${when}`;
    document.getElementById('nextup-sub').textContent = next.sub || '';
  }
}

function renderPipeline() {
  const by = (status) => allApps.filter(a => a.status === status).length;
  document.getElementById('pipeline-count').textContent = `${allApps.length} application${allApps.length === 1 ? '' : 's'}`;
  document.getElementById('chip-saved').textContent = by('saved');
  document.getElementById('chip-referral').textContent = allApps.filter(a => (a.source || '').toLowerCase().includes('referral')).length;
  document.getElementById('chip-applied').textContent = by('applied');
  document.getElementById('chip-interview').textContent = by('interviewing');
  document.getElementById('chip-offer').textContent = by('offered');
  document.getElementById('chip-rejected').textContent = by('rejected');
}

function statusChip(app) {
  const now = Date.now();
  if (app.status === 'interviewing') return { cls: 'interview', label: 'Interview' };
  if (app.status === 'rejected') return { cls: 'rejected', label: 'Rejected' };
  if (app.status === 'offered') return { cls: 'interview', label: 'Offer' };
  if (app.status === 'applied' && now - (app.appliedAt || 0) > 10 * 24 * 3600 * 1000) return { cls: 'followup', label: 'Follow up' };
  if (app.status === 'saved') return { cls: '', label: 'Saved' };
  if (app.status === 'withdrawn') return { cls: '', label: 'Withdrawn' };
  return { cls: '', label: 'Applied' };
}

function renderList() {
  const list = document.getElementById('app-list');
  let apps = allApps;
  if (currentFilter === 'active') apps = allApps.filter(a => ['applied', 'interviewing', 'offered'].includes(a.status));
  if (currentFilter === 'interviewing') apps = allApps.filter(a => a.status === 'interviewing');

  if (apps.length === 0) {
    list.innerHTML = '<div class="empty-apps">No applications yet — Fill All on any job page logs it here automatically.</div>';
    return;
  }

  list.innerHTML = apps.map(app => {
    const chip = statusChip(app);
    const selected = app.id === selectedId;
    const hot = app.status === 'interviewing' || app.status === 'offered';
    const filledBy = app.source === 'autofill' ? 'Filled by QuickApply' : chip.label;
    const host = (() => { try { return new URL(app.url).hostname.replace('www.', ''); } catch (e) { return ''; } })();
    return `
    <button class="app-row${selected ? ' selected' : ''}${app.status === 'rejected' ? ' dim' : ''}" data-id="${esc(app.id)}">
      <span class="app-avatar${hot ? ' hot' : ''}">${esc(initials(app.company))}</span>
      <span class="app-info">
        <span class="app-title">${esc(app.company)} · ${esc(app.position)}</span>
        <span class="app-sub">${esc(filledBy)} · ${timeAgo(app.appliedAt)}${host ? ' · ' + esc(host) : ''}</span>
      </span>
      <span class="app-status ${chip.cls}">${chip.label}</span>
    </button>`;
  }).join('');

  list.querySelectorAll('.app-row').forEach(row => {
    row.addEventListener('click', () => {
      selectedId = row.getAttribute('data-id');
      renderList();
      renderDetail();
    });
  });
}

function renderDetail() {
  const detail = document.getElementById('detail');
  const app = allApps.find(a => a.id === selectedId);
  if (!app) {
    detail.innerHTML = '<div class="detail-empty">Select an application to see its story.</div>';
    return;
  }

  const fillMatch = (app.notes || '').match(/Auto-filled (\d+)\/(\d+)/);
  const score = fillMatch ? `${fillMatch[1]}/${fillMatch[2]}` : '—';
  const logRows = [];
  if (fillMatch) {
    logRows.push({ color: '#c9f24d', text: 'Contact, work authorization, education', count: `${fillMatch[1]} fields` });
    if (+fillMatch[2] > +fillMatch[1]) logRows.push({ color: '#f0b429', text: 'Fields needing a human', count: `${+fillMatch[2] - +fillMatch[1]}` });
  }
  logRows.push({ color: '#f0b429', text: 'Resume upload — done by hand', count: 'skipped' });

  detail.innerHTML = `
    <div class="detail-head">
      <span class="detail-avatar">${esc(initials(app.company))}</span>
      <div style="flex:1">
        <div class="detail-title">${esc(app.position)}</div>
        <div class="detail-sub">${esc(app.company)}${app.location ? ' · ' + esc(app.location) : ''} · ${statusChip(app).label.toLowerCase()} ${timeAgo(app.appliedAt)}</div>
      </div>
      <div class="detail-score">
        <span class="detail-score-num">${score}</span>
        <span class="detail-score-label">fields filled<br>by QuickApply</span>
      </div>
    </div>
    <div class="hr"></div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <span class="log-label">Fill log</span>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${logRows.map(r => `
        <div class="log-row"><span class="log-dot" style="background:${r.color}"></span><span class="grow">${esc(r.text)}</span><span class="log-count">${esc(r.count)}</span></div>`).join('')}
      </div>
    </div>
    ${app.notes ? `<div class="hr"></div><div style="font-size:12.5px;line-height:1.5;color:#c4c4bf">${esc(app.notes)}</div>` : ''}
    <div class="detail-actions">
      <button class="btn-lime-lg" id="log-followup">Log follow-up</button>
      ${app.url ? `<button class="btn-dark" id="open-posting">Open posting</button>` : ''}
    </div>
  `;

  document.getElementById('log-followup')?.addEventListener('click', async () => {
    const followUps = app.followUps || [];
    followUps.push({ date: Date.now() + 3 * 24 * 3600 * 1000, note: 'Follow up' });
    await chrome.runtime.sendMessage({ type: 'saveApplication', application: { ...app, followUps } });
    await loadApplications();
  });
  document.getElementById('open-posting')?.addEventListener('click', () => {
    if (app.url) window.open(app.url, '_blank');
  });
}

function setupListeners() {
  document.querySelectorAll('.filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.getAttribute('data-filter');
      renderList();
    });
  });

  document.getElementById('track-btn')?.addEventListener('click', async () => {
    const input = document.getElementById('track-url');
    const url = input.value.trim();
    if (!url) return;
    let company = 'Saved job';
    try { company = new URL(url).hostname.replace('www.', '').split('.')[0]; } catch (e) {}
    company = company.charAt(0).toUpperCase() + company.slice(1);
    await chrome.runtime.sendMessage({
      type: 'saveApplication',
      application: {
        company, position: 'Saved from link', url, status: 'saved', source: 'manual',
        notes: '', contacts: [], interviews: [], followUps: []
      }
    });
    input.value = '';
    await loadApplications();
  });
}
