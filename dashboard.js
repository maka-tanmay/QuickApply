// JobRight AI - Dashboard Script
// Premium career command center

console.log('JobRight AI Dashboard loaded');

// Tab switching
function setupTabNavigation() {
  document.querySelectorAll('.nav-item').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      switchToTab(tabName);
    });
  });
  
  // Handle hash navigation (for links from popup)
  if (window.location.hash) {
    const tabName = window.location.hash.substring(1);
    switchToTab(tabName);
  }
}

function switchToTab(tabName) {
  // Update nav items
  document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
  const activeNav = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
  if (activeNav) activeNav.classList.add('active');
  
  // Update tab content
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  const tabContent = document.getElementById(`${tabName}-tab`);
  if (tabContent) tabContent.classList.add('active');
  
  // Update URL hash without scrolling
  history.replaceState(null, null, `#${tabName}`);
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  setupTabNavigation();
  await loadStats();
  await loadApplications();
  await loadSuggestions();
  setupEventListeners();
});

async function loadStats() {
  try {
    const stats = await chrome.runtime.sendMessage({ type: 'getApplicationStats' });
    document.getElementById('stat-total').textContent = stats.total || 0;
    document.getElementById('stat-response').textContent = (stats.responseRate || 0) + '%';
    document.getElementById('stat-interview').textContent = (stats.interviewRate || 0) + '%';
    document.getElementById('stat-offers').textContent = stats.byStatus?.offered || 0;
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

async function loadApplications() {
  try {
    const applications = await chrome.runtime.sendMessage({ type: 'getApplications' }) || [];
    const list = document.getElementById('application-list');
    
    if (applications.length === 0) {
      list.innerHTML = '<li class="empty-state">No applications tracked yet</li>';
      return;
    }
    
    list.innerHTML = applications.map(app => `
      <li class="application-item">
        <div class="application-info">
          <h3>${escapeHtml(app.position)}</h3>
          <p>${escapeHtml(app.company)} • ${new Date(app.appliedAt).toLocaleDateString()}</p>
        </div>
        <span class="status-badge status-${app.status}">${app.status}</span>
      </li>
    `).join('');
  } catch (error) {
    console.error('Error loading applications:', error);
  }
}

async function loadSuggestions() {
  try {
    const suggestions = await chrome.runtime.sendMessage({ type: 'getApplicationSuggestions' }) || [];
    const container = document.getElementById('suggestions-list');
    
    if (suggestions.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>Track more applications to get AI suggestions!</p></div>';
      return;
    }
    
    container.innerHTML = suggestions.map(s => `
      <div class="suggestion-item">${escapeHtml(s)}</div>
    `).join('');
  } catch (error) {
    console.error('Error loading suggestions:', error);
  }
}

function setupEventListeners() {
  // Generate Cover Letter
  document.getElementById('generate-cover-letter')?.addEventListener('click', async () => {
    const title = document.getElementById('cl-title').value.trim();
    const company = document.getElementById('cl-company').value.trim();
    const manager = document.getElementById('cl-manager').value.trim();
    const jd = document.getElementById('cl-jd').value.trim();

    if (!title || !company) {
      alert('Please enter job title and company');
      return;
    }

    const result = document.getElementById('cover-letter-result');
    result.innerHTML = '<div class="loading">Generating cover letter...</div>';

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'generateCoverLetter',
        jobTitle: title,
        company,
        hiringManager: manager || null,
        jobDescription: jd
      });

      if (response.error) {
        result.innerHTML = `<div class="result-box" style="color: #ef4444;">Error: ${response.error}</div>`;
        return;
      }

      result.innerHTML = `
        <div class="result-box">${escapeHtml(response.coverLetter)}</div>
        <button class="btn btn-secondary" onclick="navigator.clipboard.writeText(document.querySelector('#cover-letter-result .result-box').textContent); alert('Copied!');" style="margin-top: 12px;">
          📋 Copy to Clipboard
        </button>
      `;
    } catch (error) {
      result.innerHTML = `<div class="result-box" style="color: #ef4444;">Error: ${error.message}</div>`;
    }
  });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

