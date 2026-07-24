// JobRight AI - Options Page Script
// Premium settings and profile management

console.log('JobRight AI: Options page loaded');

let profiles = [];
let editingProfileId = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    // Setup tab navigation
    setupTabNavigation();
    
    // Load all data
    await Promise.all([
      loadProfiles(),
      loadAISettings(),
      loadLearningData(),
      loadCoverLetters()
    ]);
    
    // Setup event listeners
    setupEventListeners();
    setupAIEventListeners();
    setupLearningEventListeners();
    
  } catch (error) {
    console.error('JobRight AI Options: Init error:', error);
    showMessage('Error loading data: ' + error.message, 'error');
  }
}

function setupTabNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  const contents = document.querySelectorAll('.tab-content');
  
  // Function to switch to a specific tab
  function switchToTab(tabName) {
    tabs.forEach(t => t.classList.remove('active'));
    contents.forEach(c => c.classList.remove('active'));
    
    const targetTab = document.querySelector(`.nav-tab[data-tab="${tabName}"]`);
    const targetContent = document.getElementById(`${tabName}-tab`);
    
    if (targetTab) targetTab.classList.add('active');
    if (targetContent) targetContent.classList.add('active');
  }
  
  // Add click handlers to tabs
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      switchToTab(tabName);
      // Update URL hash
      window.location.hash = tabName;
      // Load dashboard data if dashboard tab is selected
      if (tabName === 'dashboard') {
        loadDashboardData();
      }
    });
  });
  
  // Check for hash in URL to open specific tab (e.g., #ai-settings)
  const hash = window.location.hash.slice(1); // Remove the #
  if (hash && ['profiles', 'ai-settings', 'cover-letters', 'dashboard'].includes(hash)) {
    console.log('JobRight AI: Opening tab from URL hash:', hash);
    switchToTab(hash);
    if (hash === 'dashboard') {
      loadDashboardData();
    }
  }
}

// Dashboard data loading
async function loadDashboardData() {
  try {
    await Promise.all([
      loadDashboardStats(),
      loadDashboardApplications(),
      loadDashboardSuggestions()
    ]);
  } catch (error) {
    console.error('Error loading dashboard data:', error);
  }
}

async function loadDashboardStats() {
  try {
    const stats = await chrome.runtime.sendMessage({ type: 'getApplicationStats' }) || {};
    const totalEl = document.getElementById('dashboard-stat-total');
    const responseEl = document.getElementById('dashboard-stat-response');
    const interviewEl = document.getElementById('dashboard-stat-interview');
    const offersEl = document.getElementById('dashboard-stat-offers');
    
    if (totalEl) totalEl.textContent = stats.total || 0;
    if (responseEl) responseEl.textContent = (stats.responseRate || 0) + '%';
    if (interviewEl) interviewEl.textContent = (stats.interviewRate || 0) + '%';
    if (offersEl) offersEl.textContent = stats.byStatus?.offered || 0;
  } catch (error) {
    console.error('Error loading dashboard stats:', error);
  }
}

async function loadDashboardApplications() {
  try {
    const applications = await chrome.runtime.sendMessage({ type: 'getApplications' }) || [];
    const list = document.getElementById('dashboard-application-list');
    
    if (!list) return;
    
    if (applications.length === 0) {
      list.innerHTML = `
        <li class="empty-state">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            </svg>
          </div>
          <h3>No applications tracked</h3>
          <p>Applications you fill using the extension will appear here</p>
        </li>
      `;
      return;
    }
    
    // Show recent 10 applications
    const recentApps = applications.slice(0, 10);
    list.innerHTML = recentApps.map(app => {
      const date = app.appliedAt ? new Date(app.appliedAt).toLocaleDateString() : 'N/A';
      const statusClass = `status-${app.status || 'saved'}`;
      return `
        <li class="application-item">
          <div class="application-info">
            <h3>${escapeHtml(app.position || 'Unknown Position')}</h3>
            <p>${escapeHtml(app.company || 'Unknown Company')} • ${date}</p>
          </div>
          <span class="status-badge ${statusClass}">${(app.status || 'saved').charAt(0).toUpperCase() + (app.status || 'saved').slice(1)}</span>
        </li>
      `;
    }).join('');
  } catch (error) {
    console.error('Error loading dashboard applications:', error);
  }
}

async function loadDashboardSuggestions() {
  try {
    const suggestions = await chrome.runtime.sendMessage({ type: 'getApplicationSuggestions' }) || [];
    const container = document.getElementById('dashboard-suggestions-list');
    const upcomingContainer = document.getElementById('dashboard-upcoming-list');
    
    if (!container) return;
    
    if (suggestions.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>Track more applications to get AI suggestions!</p></div>';
    } else {
      container.innerHTML = suggestions.slice(0, 5).map(s => `
        <div class="suggestion-item">${escapeHtml(s)}</div>
      `).join('');
    }
    
    // For upcoming actions, we can show interviews scheduled
    if (upcomingContainer) {
      const upcoming = suggestions.filter(s => s.toLowerCase().includes('interview') || s.toLowerCase().includes('follow'));
      if (upcoming.length === 0) {
        upcomingContainer.innerHTML = '<div class="empty-state"><p>No upcoming interviews or follow-ups</p></div>';
      } else {
        upcomingContainer.innerHTML = upcoming.slice(0, 3).map(s => `
          <div class="suggestion-item">${escapeHtml(s)}</div>
        `).join('');
      }
    }
  } catch (error) {
    console.error('Error loading dashboard suggestions:', error);
  }
}

async function loadAISettings() {
  try {
    const settings = await chrome.runtime.sendMessage({ type: 'getSettings' });
    document.getElementById('ai-enabled').checked = settings.aiEnabled || false;
    
    // Set provider (default to openrouter since it has free models)
    const provider = settings.aiProvider || 'openrouter';
    document.getElementById('ai-provider').value = provider;
    toggleProviderSettings(provider);
    
    // Set models
    document.getElementById('openrouter-model').value = settings.openrouterModel || 'google/gemma-2-9b-it:free';
    document.getElementById('perplexity-model').value = settings.perplexityModel || 'sonar';
    document.getElementById('deepseek-model').value = settings.deepseekModel || 'deepseek-chat';
    
    // Don't show actual API keys, just indicate if they're set
    if (settings.hasOpenRouterKey) {
      document.getElementById('openrouter-api-key').placeholder = '••••••••••••••••';
    }
    if (settings.hasPerplexityKey) {
      document.getElementById('perplexity-api-key').placeholder = '••••••••••••••••';
    }
    if (settings.hasDeepSeekKey) {
      document.getElementById('deepseek-api-key').placeholder = '••••••••••••••••';
    }
    
    // Show status based on active provider
    if (provider === 'claude-cli') {
      updateAIStatus('✓ Claude Code CLI — no API key needed (requires native host install)', 'success');
    } else if (provider === 'openrouter' && settings.hasOpenRouterKey) {
      updateAIStatus('✓ OpenRouter API key configured', 'success');
    } else if (provider === 'perplexity' && settings.hasPerplexityKey) {
      updateAIStatus('✓ Perplexity API key configured', 'success');
    } else if (provider === 'deepseek' && settings.hasDeepSeekKey) {
      updateAIStatus('✓ DeepSeek API key configured', 'success');
    }
  } catch (error) {
    console.error('Error loading AI settings:', error);
  }
}

function toggleProviderSettings(provider) {
  const panels = {
    'claude-cli': document.getElementById('claude-cli-settings'),
    openrouter: document.getElementById('openrouter-settings'),
    perplexity: document.getElementById('perplexity-settings'),
    deepseek: document.getElementById('deepseek-settings'),
  };
  for (const [name, panel] of Object.entries(panels)) {
    if (panel) panel.style.display = name === provider ? 'block' : 'none';
  }
}

function setupAIEventListeners() {
  document.getElementById('ai-provider')?.addEventListener('change', (e) => {
    toggleProviderSettings(e.target.value);
  });
  document.getElementById('save-ai-settings')?.addEventListener('click', saveAISettings);
  document.getElementById('save-ats-account')?.addEventListener('click', saveAtsAccount);
  loadAtsAccount();
}

// ===== ATS account credentials (create-account / sign-in walls) =====
async function loadAtsAccount() {
  try {
    const acc = await chrome.storage.local.get(['qaAccountEmail', 'qaAccountPassword', 'qaAccounts']);
    const emailEl = document.getElementById('ats-account-email');
    const passEl = document.getElementById('ats-account-password');
    if (emailEl && acc.qaAccountEmail) emailEl.value = acc.qaAccountEmail;
    if (passEl && acc.qaAccountPassword) passEl.placeholder = '•••••••••• (saved)';

    const domainsEl = document.getElementById('ats-account-domains');
    const domains = Object.keys(acc.qaAccounts || {});
    if (domainsEl) {
      domainsEl.textContent = domains.length
        ? `Accounts created on: ${domains.join(', ')}`
        : 'No company accounts registered yet — they are recorded automatically when QuickApply fills a sign-up page.';
    }
  } catch (e) {
    console.error('Error loading ATS account:', e);
  }
}

async function saveAtsAccount() {
  const email = document.getElementById('ats-account-email')?.value.trim() || '';
  const password = document.getElementById('ats-account-password')?.value || '';
  const status = document.getElementById('ats-account-status');
  try {
    const updates = {};
    if (email) updates.qaAccountEmail = email;
    if (password && !password.includes('•')) updates.qaAccountPassword = password;
    await chrome.storage.local.set(updates);
    const passEl = document.getElementById('ats-account-password');
    if (passEl && password) { passEl.value = ''; passEl.placeholder = '•••••••••• (saved)'; }
    if (status) { status.textContent = '✓ Account saved'; status.style.color = '#10b981'; }
    showMessage('ATS account saved', 'success');
  } catch (e) {
    if (status) { status.textContent = '✗ Error saving account'; status.style.color = '#ef4444'; }
  }
}

// Learning Data Functions
async function loadLearningData() {
  try {
    const result = await chrome.storage.local.get('aiLearningData');
    const data = result.aiLearningData;
    const statsDiv = document.getElementById('learning-stats');
    
    if (!statsDiv) return;
    
    if (!data || !data.coverLetterExamples || data.coverLetterExamples.length === 0) {
      statsDiv.innerHTML = `
        <div style="text-align: center; color: #64748b;">
          <p style="font-size: 32px; margin: 0;">📭</p>
          <p style="margin: 8px 0 0;">No learning data yet</p>
          <p style="font-size: 12px; margin-top: 4px;">Generate and edit cover letters for the AI to learn your style</p>
        </div>
      `;
      return;
    }
    
    const coverLetterCount = data.coverLetterExamples.length;
    const phraseCount = data.preferredPhrases?.filter(p => p.count >= 2).length || 0;
    const lastUpdated = data.lastUpdated ? new Date(data.lastUpdated).toLocaleDateString() : 'Never';
    
    statsDiv.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; text-align: center;">
        <div>
          <div style="font-size: 24px; font-weight: 600; color: #10b981;">${coverLetterCount}</div>
          <div style="font-size: 12px; color: #64748b;">Cover Letters Learned</div>
        </div>
        <div>
          <div style="font-size: 24px; font-weight: 600; color: #8b5cf6;">${phraseCount}</div>
          <div style="font-size: 12px; color: #64748b;">Preferred Phrases</div>
        </div>
        <div>
          <div style="font-size: 14px; font-weight: 500; color: #3b82f6;">${lastUpdated}</div>
          <div style="font-size: 12px; color: #64748b;">Last Updated</div>
        </div>
      </div>
      <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">
        ✨ AI will use your writing style, phrases, and examples when generating new cover letters
      </div>
    `;
  } catch (error) {
    console.error('Error loading learning data:', error);
  }
}

function setupLearningEventListeners() {
}

async function viewLearnedPhrases() {
  try {
    const result = await chrome.storage.local.get('aiLearningData');
    const data = result.aiLearningData;
    
    if (!data || !data.preferredPhrases || data.preferredPhrases.length === 0) {
      showMessage('No learned phrases yet. Generate more cover letters!', 'info');
      return;
    }
    
    // Create modal to show phrases
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;
    
    const phrasesHtml = data.preferredPhrases
      .filter(p => p.count >= 2)
      .slice(0, 20)
      .map((p, i) => `
        <div style="padding: 12px; background: ${i % 2 === 0 ? '#f8fafc' : 'white'}; border-radius: 4px; margin-bottom: 8px;">
          <div style="font-size: 13px; color: #1e293b;">"${p.phrase.substring(0, 100)}${p.phrase.length > 100 ? '...' : ''}"</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Used ${p.count}x • Last used: ${new Date(p.lastUsed).toLocaleDateString()}</div>
        </div>
      `).join('');
    
    modal.innerHTML = `
      <div style="background: white; border-radius: 12px; padding: 24px; max-width: 600px; max-height: 80vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3 style="margin: 0; font-size: 18px;">🧠 Learned Phrases</h3>
          <button id="close-phrases-modal" style="background: none; border: none; font-size: 20px; cursor: pointer;">×</button>
        </div>
        <p style="color: #64748b; font-size: 13px; margin-bottom: 16px;">
          These phrases appear frequently in your cover letters. The AI uses them to match your writing style.
        </p>
        ${phrasesHtml || '<p style="color: #64748b; text-align: center;">No frequently used phrases yet.</p>'}
      </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.id === 'close-phrases-modal') {
        modal.remove();
      }
    });
  } catch (error) {
    console.error('Error viewing phrases:', error);
    showMessage('Error loading phrases', 'error');
  }
}

async function clearLearningData() {
  if (!confirm('Are you sure you want to reset AI learning? The AI will forget your writing style and preferences.')) {
    return;
  }
  
  try {
    await chrome.storage.local.remove('aiLearningData');
    await loadLearningData();
    showMessage('AI learning data cleared', 'success');
  } catch (error) {
    console.error('Error clearing learning data:', error);
    showMessage('Error clearing data', 'error');
  }
}

async function testApiKey(provider) {
  const keyInputMap = {
    'openrouter': 'openrouter-api-key',
    'perplexity': 'perplexity-api-key',
    'deepseek': 'deepseek-api-key'
  };
  
  const keyInput = document.getElementById(keyInputMap[provider]);
  const apiKey = keyInput?.value.trim();
  
  if (!apiKey || apiKey.includes('•')) {
    updateAIStatus('Please enter an API key', 'error');
    return;
  }
  
  const providerNames = {
    'openrouter': 'OpenRouter',
    'perplexity': 'Perplexity',
    'deepseek': 'DeepSeek'
  };
  
  updateAIStatus(`Testing ${providerNames[provider]} API key...`, 'info');
  
  try {
    const response = await chrome.runtime.sendMessage({ 
      type: 'testApiKey', 
      apiKey,
      provider
    });
    
    if (response.success) {
      updateAIStatus(`✓ ${providerNames[provider]} API key is valid!`, 'success');
    } else {
      updateAIStatus('✗ Invalid API key: ' + (response.error || 'Unknown error'), 'error');
    }
  } catch (error) {
    updateAIStatus('✗ Error testing API key: ' + error.message, 'error');
  }
}

async function saveAISettings() {
  const aiEnabled = document.getElementById('ai-enabled').checked;
  const aiProvider = document.getElementById('ai-provider').value;
  const openrouterKeyInput = document.getElementById('openrouter-api-key');
  const perplexityKeyInput = document.getElementById('perplexity-api-key');
  const deepseekKeyInput = document.getElementById('deepseek-api-key');
  
  const openrouterKey = openrouterKeyInput?.value.trim() || '';
  const perplexityKey = perplexityKeyInput?.value.trim() || '';
  const deepseekKey = deepseekKeyInput?.value.trim() || '';
  
  const openrouterModel = document.getElementById('openrouter-model').value;
  const perplexityModel = document.getElementById('perplexity-model').value;
  const deepseekModel = document.getElementById('deepseek-model').value;
  
  const updates = {
    aiEnabled,
    aiProvider,
    openrouterModel,
    perplexityModel,
    deepseekModel
  };
  
  // Only update API keys if new ones were entered (not masked placeholder)
  // If field is empty or contains only placeholder, don't send it (preserve existing)
  if (openrouterKey && !openrouterKey.includes('•') && openrouterKey.length > 0) {
    updates.openrouterApiKey = openrouterKey;
    console.log('JobRight AI: Saving OpenRouter API key (length:', openrouterKey.length, ')');
  }
  if (perplexityKey && !perplexityKey.includes('•') && perplexityKey.length > 0) {
    updates.perplexityApiKey = perplexityKey;
    console.log('JobRight AI: Saving Perplexity API key (length:', perplexityKey.length, ')');
  }
  if (deepseekKey && !deepseekKey.includes('•') && deepseekKey.length > 0) {
    updates.deepseekApiKey = deepseekKey;
    console.log('JobRight AI: Saving DeepSeek API key (length:', deepseekKey.length, ')');
  }
  
  try {
    const response = await chrome.runtime.sendMessage({ 
      type: 'updateSettings', 
      settings: updates 
    });
    
    if (response?.success) {
      updateAIStatus('✓ AI settings saved!', 'success');
      showMessage('AI settings saved successfully!', 'success');
      
      // Clear the input fields after successful save (they'll show placeholder on next load)
      if (openrouterKeyInput && openrouterKey) openrouterKeyInput.value = '';
      if (perplexityKeyInput && perplexityKey) perplexityKeyInput.value = '';
      if (deepseekKeyInput && deepseekKey) deepseekKeyInput.value = '';
      
      // Reload settings to update placeholders
      setTimeout(() => loadAISettings(), 500);
    } else {
      updateAIStatus('✗ Error saving settings', 'error');
    }
  } catch (error) {
    console.error('JobRight AI: Error saving AI settings:', error);
    updateAIStatus('✗ Error saving: ' + error.message, 'error');
  }
}

function updateAIStatus(message, type) {
  const status = document.getElementById('ai-status');
  if (!status) return;
  
  const colors = {
    success: { bg: '#dcfce7', color: '#166534' },
    error: { bg: '#fee2e2', color: '#991b1b' },
    info: { bg: '#dbeafe', color: '#1e40af' }
  };
  
  const c = colors[type] || colors.info;
  status.style.display = 'block';
  status.style.background = c.bg;
  status.style.color = c.color;
  status.textContent = message;
}

async function loadProfiles() {
  profiles = await chrome.runtime.sendMessage({ type: 'getAllProfiles' }) || [];
  console.log('JobRight AI Options: Loaded', profiles.length, 'profiles');
  renderProfiles();
}

function renderProfiles() {
  const list = document.getElementById('profile-list');
  if (!list) return;
  
  if (profiles.length === 0) {
    list.innerHTML = '<li class="empty-state">No profiles yet. Create your first profile!</li>';
    return;
  }
  
  list.innerHTML = profiles.map(profile => `
    <li class="profile-item" data-id="${profile.profile_id}">
      <div class="profile-info">
        <h3>${escapeHtml(profile.name)}</h3>
        <p>${escapeHtml(profile.email)} • ${escapeHtml(profile.first_name || '')} ${escapeHtml(profile.last_name || '')}</p>
      </div>
      <div class="profile-actions">
        <button class="btn btn-secondary btn-sm edit-btn">Edit</button>
        <button class="btn btn-danger btn-sm delete-btn">Delete</button>
      </div>
    </li>
  `).join('');
  
  list.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const item = e.target.closest('.profile-item');
      editProfile(item.dataset.id);
    });
  });
  
  list.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const item = e.target.closest('.profile-item');
      deleteProfile(item.dataset.id);
    });
  });
}

function setupEventListeners() {
  document.getElementById('create-profile-btn')?.addEventListener('click', () => showProfileForm());
  document.getElementById('cancel-btn')?.addEventListener('click', () => hideProfileForm());
  document.getElementById('profile-form-element')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveProfile();
  });

  // Dashboard button
  document.getElementById('open-dashboard-btn')?.addEventListener('click', () => {
    const dashboardUrl = chrome.runtime.getURL('dashboard.html');
    chrome.tabs.create({ url: dashboardUrl });
  });

}

function showProfileForm(profile = null) {
  editingProfileId = profile?.profile_id || null;
  
  const form = document.getElementById('profile-form');
  const title = document.getElementById('form-title');
  
  if (form) form.classList.add('active');
  if (title) title.textContent = profile ? 'Edit Profile' : 'Create Profile';
  
  // Helper function to safely set value
  const setVal = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value || '';
  };
  
  // Basic fields
  setVal('profile-id', profile?.profile_id);
  setVal('profile-name', profile?.name);
  setVal('profile-email', profile?.email);
  setVal('profile-username', profile?.username || profile?.fields?.username);
  setVal('first-name', profile?.first_name);
  setVal('last-name', profile?.last_name);
  setVal('profile-phone', profile?.phone);
  setVal('profile-location', profile?.location);
  setVal('profile-country', profile?.country || profile?.fields?.country);
  setVal('citizenship', profile?.fields?.citizenship || profile?.country);
  
  // Education
  setVal('education-level', profile?.fields?.education_level);
  setVal('university', profile?.fields?.university);
  setVal('major', profile?.fields?.major);
  setVal('gpa', profile?.fields?.gpa);
  setVal('enrolled', profile?.fields?.enrolled);
  setVal('graduation-date', profile?.fields?.graduation_date);
  
  // Work authorization & Legal
  setVal('work-authorized', profile?.fields?.work_authorized);
  setVal('sponsorship', profile?.fields?.sponsorship);
  setVal('over-18', profile?.fields?.over_18);
  setVal('background-check', profile?.fields?.background_check);
  setVal('drug-test', profile?.fields?.drug_test);
  setVal('non-compete', profile?.fields?.non_compete);
  
  // Work Preferences
  setVal('in-office', profile?.fields?.in_office);
  setVal('remote-preference', profile?.fields?.remote_preference);
  setVal('relocate', profile?.fields?.relocate);
  setVal('travel', profile?.fields?.travel);
  setVal('start-date', profile?.fields?.start_date);
  setVal('employment-type', profile?.fields?.employment_type || 'Full-time');
  
  // Compensation
  setVal('current-salary', profile?.fields?.current_salary);
  setVal('expected-salary', profile?.fields?.expected_salary);
  
  // Demographics
  setVal('gender', profile?.fields?.gender);
  setVal('ethnicity', profile?.fields?.ethnicity);
  setVal('hispanic', profile?.fields?.hispanic);
  setVal('veteran', profile?.fields?.veteran_status);
  setVal('disability', profile?.fields?.disability);
  
  // Links
  setVal('linkedin-url', profile?.fields?.linkedin_url);
  setVal('portfolio-url', profile?.fields?.portfolio_url);
  setVal('github-url', profile?.fields?.github_url);
  
  // Other
  setVal('referral-source', profile?.fields?.referral_source || 'Online Search');
  
  // Experience & Skills
  setVal('current-title', profile?.fields?.current_title);
  setVal('years-experience', profile?.fields?.years_experience);
  setVal('skills', profile?.fields?.skills);
  
  // Answer Bank
  setVal('answer-why-interested', profile?.answers?.why_interested);
  setVal('answer-why-company', profile?.answers?.why_company);
  setVal('answer-about-yourself', profile?.answers?.about_yourself);
  setVal('answer-strengths', profile?.answers?.strengths);
  setVal('answer-weaknesses', profile?.answers?.weaknesses);
  setVal('answer-leadership', profile?.answers?.leadership);
  setVal('answer-challenge', profile?.answers?.challenge);
  setVal('answer-achievement', profile?.answers?.achievement);
  setVal('answer-future-goals', profile?.answers?.future_goals);
  setVal('answer-additional', profile?.answers?.additional);
  
  // Resume
  document.getElementById('resume-text').value = profile?.resume_text || '';
  
  // Custom fields
  const fieldsContainer = document.getElementById('custom-fields');
  fieldsContainer.innerHTML = '';
  
  // Add custom fields that aren't in the predefined list
  const predefinedKeys = ['enrolled', 'graduation_date', 'work_authorized', 'sponsorship', 'over_18', 'in_office', 'relocate', 'gender', 'ethnicity', 'hispanic', 'veteran_status', 'referral_source', 'country', 'current_title', 'years_experience', 'skills'];
  
  if (profile?.fields) {
    Object.entries(profile.fields).forEach(([key, value]) => {
      if (!predefinedKeys.includes(key)) {
        addFieldRow(key, value);
      }
    });
  }
  
  form?.scrollIntoView({ behavior: 'smooth' });
}

function hideProfileForm() {
  const form = document.getElementById('profile-form');
  if (form) form.classList.remove('active');
  editingProfileId = null;
}

function addFieldRow(key = '', value = '') {
  const container = document.getElementById('custom-fields');
  const row = document.createElement('div');
  row.style.cssText = 'display: flex; gap: 8px; margin-bottom: 8px;';
  row.innerHTML = `
    <input type="text" class="field-key" placeholder="Field name (e.g., linkedin_url)" value="${escapeHtml(key)}" style="flex: 1; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px;">
    <input type="text" class="field-value" placeholder="Value" value="${escapeHtml(value)}" style="flex: 1; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px;">
    <button type="button" class="btn btn-secondary btn-sm remove-btn">×</button>
  `;
  
  row.querySelector('.remove-btn').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

async function saveProfile() {
  const name = document.getElementById('profile-name').value.trim();
  const email = document.getElementById('profile-email').value.trim();
  const firstName = document.getElementById('first-name').value.trim();
  const lastName = document.getElementById('last-name').value.trim();
  
  if (!name || !email || !firstName || !lastName) {
    showMessage('Profile Name, Email, First Name, and Last Name are required', 'error');
    return;
  }
  
  // Helper to get value
  const getVal = (id) => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };
  
  // Collect all fields
  const fields = {};
  
  // Add field if it has value
  const addField = (id, key) => {
    const val = getVal(id);
    if (val) fields[key] = val;
  };
  
  // Citizenship
  addField('citizenship', 'citizenship');
  
  // Education
  addField('education-level', 'education_level');
  addField('university', 'university');
  addField('major', 'major');
  addField('gpa', 'gpa');
  addField('enrolled', 'enrolled');
  addField('graduation-date', 'graduation_date');
  
  // Work authorization & Legal
  addField('work-authorized', 'work_authorized');
  addField('sponsorship', 'sponsorship');
  addField('over-18', 'over_18');
  addField('background-check', 'background_check');
  addField('drug-test', 'drug_test');
  addField('non-compete', 'non_compete');
  
  // Work Preferences
  addField('in-office', 'in_office');
  addField('remote-preference', 'remote_preference');
  addField('relocate', 'relocate');
  addField('travel', 'travel');
  addField('start-date', 'start_date');
  addField('employment-type', 'employment_type');
  
  // Compensation
  addField('current-salary', 'current_salary');
  addField('expected-salary', 'expected_salary');
  
  // Demographics
  addField('gender', 'gender');
  addField('ethnicity', 'ethnicity');
  addField('hispanic', 'hispanic');
  addField('veteran', 'veteran_status');
  addField('disability', 'disability');
  
  // Links
  addField('linkedin-url', 'linkedin_url');
  addField('portfolio-url', 'portfolio_url');
  addField('github-url', 'github_url');
  
  // Other
  addField('referral-source', 'referral_source');
  
  // Answer Bank
  const answers = {};
  const addAnswer = (id, key) => {
    const val = getVal(id);
    if (val) answers[key] = val;
  };
  
  addAnswer('answer-why-interested', 'why_interested');
  addAnswer('answer-why-company', 'why_company');
  addAnswer('answer-about-yourself', 'about_yourself');
  addAnswer('answer-strengths', 'strengths');
  addAnswer('answer-weaknesses', 'weaknesses');
  addAnswer('answer-leadership', 'leadership');
  addAnswer('answer-challenge', 'challenge');
  addAnswer('answer-achievement', 'achievement');
  addAnswer('answer-future-goals', 'future_goals');
  addAnswer('answer-additional', 'additional');
  
  const country = document.getElementById('profile-country').value.trim();
  if (country) fields.country = country;
  
  // Experience & Skills
  const currentTitle = document.getElementById('current-title').value.trim();
  if (currentTitle) fields.current_title = currentTitle;
  
  const yearsExperience = document.getElementById('years-experience').value.trim();
  if (yearsExperience) fields.years_experience = yearsExperience;
  
  const skills = document.getElementById('skills').value.trim();
  if (skills) fields.skills = skills;
  
  // Custom fields
  document.querySelectorAll('#custom-fields > div').forEach(row => {
    const key = row.querySelector('.field-key').value.trim();
    const value = row.querySelector('.field-value').value.trim();
    if (key && value) {
      fields[key] = value;
    }
  });
  
  const profile = {
    profile_id: editingProfileId,
    name,
    email,
    username: document.getElementById('profile-username')?.value?.trim() || '',
    first_name: firstName,
    last_name: lastName,
    phone: document.getElementById('profile-phone').value.trim(),
    location: document.getElementById('profile-location').value.trim(),
    country,
    fields,
    answers,
    resume_text: document.getElementById('resume-text').value.trim(),
    cover_letter_snippets: []
  };
  
  // Also save username in fields for easy lookup
  if (profile.username) {
    profile.fields.username = profile.username;
  }
  
  console.log('Saving profile:', profile);
  
  try {
    const response = await chrome.runtime.sendMessage({ type: 'saveProfile', profile });
    
    if (response?.success) {
      showMessage('Profile saved successfully!', 'success');
      hideProfileForm();
      await loadProfiles();
    } else {
      showMessage('Error saving profile: ' + (response?.error || 'Unknown error'), 'error');
    }
  } catch (error) {
    console.error('Save error:', error);
    showMessage('Error saving profile: ' + error.message, 'error');
  }
}

function editProfile(profileId) {
  const profile = profiles.find(p => p.profile_id === profileId);
  if (profile) showProfileForm(profile);
}

async function deleteProfile(profileId) {
  if (!confirm('Are you sure you want to delete this profile?')) return;
  
  try {
    const response = await chrome.runtime.sendMessage({ type: 'deleteProfile', profileId });
    if (response?.success) {
      showMessage('Profile deleted', 'success');
      await loadProfiles();
    }
  } catch (error) {
    showMessage('Error deleting profile: ' + error.message, 'error');
  }
}

function showMessage(text, type) {
  const container = document.getElementById('message-container');
  if (!container) return;
  
  container.innerHTML = `<div class="message message-${type}">${escapeHtml(text)}</div>`;
  setTimeout(() => container.innerHTML = '', 5000);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// Cover Letters Management
// ============================================

async function loadCoverLetters() {
  const container = document.getElementById('cover-letters-list');
  if (!container) return;
  
  try {
    const result = await chrome.storage.local.get('savedCoverLetters');
    const coverLetters = result.savedCoverLetters || [];
    
    if (coverLetters.length === 0) {
      container.innerHTML = `
        <p style="color: #64748b; text-align: center; padding: 20px;">
          No cover letters saved yet.<br>
          <small>Generate a cover letter on a job page and it will appear here.</small>
        </p>
      `;
      return;
    }
    
    container.innerHTML = coverLetters.map((cl, index) => `
      <div class="cover-letter-item" style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 12px; background: #f9fafb;">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
          <div>
            <strong style="color: #1e293b;">${escapeHtml(cl.company || 'Unknown Company')}</strong>
            <span style="color: #64748b; font-size: 13px;"> — ${escapeHtml(cl.jobTitle || 'Unknown Position')}</span>
          </div>
          <span style="color: #64748b; font-size: 12px;">${formatDate(cl.createdAt)}</span>
        </div>
        <div style="font-size: 13px; color: #475569; margin-bottom: 12px; max-height: 60px; overflow: hidden;">
          ${escapeHtml(cl.content?.substring(0, 200) || '')}...
        </div>
        <div style="display: flex; gap: 8px;">
          <button data-action="view" data-index="${index}" class="btn btn-secondary btn-sm cover-letter-action">👁️ View</button>
          <button data-action="copy" data-index="${index}" class="btn btn-secondary btn-sm cover-letter-action">📋 Copy</button>
          <button data-action="download" data-index="${index}" class="btn btn-secondary btn-sm cover-letter-action">💾 Download</button>
          <button data-action="delete" data-index="${index}" class="btn btn-secondary btn-sm cover-letter-action" style="color: #dc2626;">🗑️</button>
        </div>
      </div>
    `).join('');
    
    // Attach event listeners using event delegation
    container.addEventListener('click', async (e) => {
      const button = e.target.closest('.cover-letter-action');
      if (!button) return;
      
      const action = button.dataset.action;
      const index = parseInt(button.dataset.index);
      
      if (isNaN(index)) return;
      
      try {
        switch (action) {
          case 'view':
            await viewCoverLetter(index);
            break;
          case 'copy':
            await copyCoverLetter(index);
            break;
          case 'download':
            await downloadCoverLetter(index);
            break;
          case 'delete':
            await deleteCoverLetter(index);
            break;
        }
      } catch (error) {
        console.error('Error handling cover letter action:', error);
        showMessage('Error: ' + error.message, 'error');
      }
    });
    
  } catch (error) {
    container.innerHTML = `<p style="color: #dc2626;">Error loading cover letters: ${error.message}</p>`;
  }
}

function formatDate(isoString) {
  if (!isoString) return 'Unknown date';
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function viewCoverLetter(index) {
  try {
    const result = await chrome.storage.local.get('savedCoverLetters');
    const coverLetters = result.savedCoverLetters || [];
    const cl = coverLetters[index];
    
    if (!cl) {
      showMessage('Cover letter not found', 'error');
      return;
    }
  
  // Create modal
  const modal = document.createElement('div');
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';
  modal.innerHTML = `
    <div style="background: white; border-radius: 16px; width: 90%; max-width: 700px; max-height: 80vh; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #059669, #0d9488); color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0;">${escapeHtml(cl.company)} — ${escapeHtml(cl.jobTitle)}</h3>
        <button id="close-modal" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 18px;">×</button>
      </div>
      <div style="padding: 20px; max-height: 50vh; overflow-y: auto;">
        <p style="font-size: 12px; color: #64748b; margin-bottom: 12px;">Created: ${formatDate(cl.createdAt)} • ${cl.wordCount || 0} words • <a href="${escapeHtml(cl.url || '#')}" target="_blank">Original job posting</a></p>
        <pre style="white-space: pre-wrap; font-family: inherit; font-size: 14px; line-height: 1.6;">${escapeHtml(cl.content)}</pre>
      </div>
      <div style="padding: 16px 20px; background: #f9fafb; border-top: 1px solid #e5e7eb; display: flex; gap: 12px;">
        <button id="copy-modal" class="btn btn-primary">📋 Copy to Clipboard</button>
        <button id="download-modal" class="btn btn-secondary">💾 Download PDF</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.querySelector('#close-modal').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  
  modal.querySelector('#copy-modal').addEventListener('click', async () => {
    await navigator.clipboard.writeText(cl.content);
    showMessage('Copied to clipboard!', 'success');
  });
  
  modal.querySelector('#download-modal').addEventListener('click', async () => {
    await downloadCoverLetter(index);
    modal.remove();
  });
  } catch (error) {
    console.error('Error viewing cover letter:', error);
    showMessage('Error viewing cover letter: ' + error.message, 'error');
  }
}

async function copyCoverLetter(index) {
  try {
    const result = await chrome.storage.local.get('savedCoverLetters');
    const coverLetters = result.savedCoverLetters || [];
    const cl = coverLetters[index];
    
    if (!cl) {
      showMessage('Cover letter not found', 'error');
      return;
    }
    
    await navigator.clipboard.writeText(cl.content);
    showMessage('Cover letter copied to clipboard!', 'success');
  } catch (error) {
    console.error('Error copying cover letter:', error);
    showMessage('Error copying to clipboard: ' + error.message, 'error');
  }
}

async function downloadCoverLetter(index) {
  try {
    const result = await chrome.storage.local.get('savedCoverLetters');
    const coverLetters = result.savedCoverLetters || [];
    const cl = coverLetters[index];
    
    if (!cl) {
      showMessage('Cover letter not found', 'error');
      return;
    }
    
    const companyName = (cl.company || 'Unknown').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
    const jobTitle = (cl.jobTitle || 'Position').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
    const dateStr = cl.createdAt ? cl.createdAt.split('T')[0] : new Date().toISOString().split('T')[0];
    const fileName = `Cover_Letter_${companyName}_${jobTitle}_${dateStr}.pdf`;
    
    showMessage('📄 Generating PDF...', 'info');
    
    // Load jsPDF if not already loaded
    if (!window.jspdf) {
      // Check if script is already being loaded
      const existingScript = document.querySelector('script[src*="jspdf"]');
      if (existingScript) {
        // Wait for it to load
        await new Promise((resolve) => {
          const checkInterval = setInterval(() => {
            if (window.jspdf) {
              clearInterval(checkInterval);
              resolve(true);
            }
          }, 100);
          setTimeout(() => {
            clearInterval(checkInterval);
            resolve(true);
          }, 5000);
        });
      } else {
        // Load the script
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        script.async = true;
        
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('jsPDF loading timeout after 10 seconds'));
          }, 10000);
          
          script.onload = () => {
            clearTimeout(timeout);
            // Wait for library to initialize
            let attempts = 0;
            const checkReady = setInterval(() => {
              attempts++;
              if (window.jspdf) {
                clearInterval(checkReady);
                resolve(true);
              } else if (attempts > 50) {
                clearInterval(checkReady);
                reject(new Error('jsPDF loaded but not accessible after 5 seconds'));
              }
            }, 100);
          };
          
          script.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('Failed to load jsPDF library from CDN'));
          };
          
          document.head.appendChild(script);
        });
      }
    }
    
    // Verify it's accessible
    if (!window.jspdf) {
      throw new Error('jsPDF library is not available on window.jspdf');
    }
    
    // Create PDF - try different ways to access jsPDF
    let jsPDF;
    try {
      if (window.jspdf.jsPDF) {
        jsPDF = window.jspdf.jsPDF;
      } else if (window.jspdf.default && window.jspdf.default.jsPDF) {
        jsPDF = window.jspdf.default.jsPDF;
      } else {
        const { jsPDF: jsPDFClass } = window.jspdf;
        jsPDF = jsPDFClass;
      }
    } catch (e) {
      console.error('Error accessing jsPDF:', e);
      console.error('window.jspdf structure:', window.jspdf);
      throw new Error('Could not access jsPDF class from library');
    }
    
    if (!jsPDF) {
      console.error('jsPDF class is null/undefined. window.jspdf:', window.jspdf);
      throw new Error('jsPDF class not found in library');
    }
    
    const doc = new jsPDF();
    
    // Get profile info for header
    let profile = null;
    try {
      const profileId = await chrome.runtime.sendMessage({ type: 'getActiveProfile' });
      if (profileId) {
        profile = await chrome.runtime.sendMessage({ type: 'getProfile', profileId });
      }
    } catch (e) {
      console.log('Could not load profile for PDF header');
    }
    
    // Set up margins and dimensions
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const maxWidth = pageWidth - (margin * 2);
    let yPos = margin;
    
    // Add header with profile info
    if (profile) {
      const name = profile.name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Your Name';
      const email = profile.email || '';
      const phone = profile.phone || '';
      const location = profile.location || '';
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(name, margin, yPos);
      yPos += 7;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const contactInfo = [email, phone, location].filter(Boolean).join(' • ');
      if (contactInfo) {
        doc.text(contactInfo, margin, yPos);
        yPos += 10;
      }
    }
    
    // Add date
    const today = cl.createdAt ? new Date(cl.createdAt) : new Date();
    const dateString = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    yPos += 5;
    doc.setFontSize(10);
    doc.text(dateString, margin, yPos);
    yPos += 10;
    
    // Add company and job title
    if (cl.company || cl.jobTitle) {
      yPos += 5;
      doc.setFontSize(10);
      if (cl.company) {
        doc.text(cl.company, margin, yPos);
        yPos += 5;
      }
      if (cl.jobTitle) {
        doc.text(cl.jobTitle, margin, yPos);
        yPos += 10;
      }
    }
    
    // Add greeting
    yPos += 5;
    doc.setFontSize(11);
    doc.text('Dear Hiring Manager,', margin, yPos);
    yPos += 10;
    
    // Add cover letter body
    const coverLetterText = cl.content || '';
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    
    // Split text into lines that fit the page width
    const lines = doc.splitTextToSize(coverLetterText, maxWidth);
    
    for (let i = 0; i < lines.length; i++) {
      // Check if we need a new page
      if (yPos > pageHeight - margin - 20) {
        doc.addPage();
        yPos = margin;
      }
      
      doc.text(lines[i], margin, yPos);
      yPos += 6; // Line height
    }
    
    // Add closing
    yPos += 10;
    if (yPos > pageHeight - margin - 30) {
      doc.addPage();
      yPos = margin;
    }
    doc.text('Sincerely,', margin, yPos);
    yPos += 10;
    
    if (profile) {
      const name = profile.name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Your Name';
      doc.setFont('helvetica', 'bold');
      doc.text(name, margin, yPos);
    }
    
    // Save PDF
    console.log('Saving PDF:', fileName);
    doc.save(fileName);
    
    showMessage(`✅ PDF downloaded: ${fileName}`, 'success');
    return; // Success - exit function
    
  } catch (error) {
    console.error('PDF generation error:', error);
    console.error('Error stack:', error.stack);
    
    // Show the error to user
    showMessage(`PDF generation failed: ${error.message}. Falling back to text file...`, 'warning');
    
    // Fallback to text download if PDF fails
    try {
      const result = await chrome.storage.local.get('savedCoverLetters');
      const coverLetters = result.savedCoverLetters || [];
      const cl = coverLetters[index];
      
      if (cl) {
        const companyName = (cl.company || 'Unknown').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
        const jobTitle = (cl.jobTitle || 'Position').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
        const dateStr = cl.createdAt ? cl.createdAt.split('T')[0] : new Date().toISOString().split('T')[0];
        const fileName = `Cover_Letter_${companyName}_${jobTitle}_${dateStr}.txt`;
        
        const blob = new Blob([cl.content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showMessage('✅ Downloaded as text file (PDF generation failed)', 'warning');
      }
    } catch (fallbackError) {
      console.error('Fallback download also failed:', fallbackError);
      showMessage('Error downloading file: ' + error.message, 'error');
    }
  }
}

async function deleteCoverLetter(index) {
  try {
    if (!confirm('Delete this cover letter?')) return;
    
    const result = await chrome.storage.local.get('savedCoverLetters');
    const coverLetters = result.savedCoverLetters || [];
    
    if (index < 0 || index >= coverLetters.length) {
      showMessage('Cover letter not found', 'error');
      return;
    }
    
    coverLetters.splice(index, 1);
    await chrome.storage.local.set({ savedCoverLetters: coverLetters });
    
    showMessage('Cover letter deleted', 'success');
    await loadCoverLetters();
  } catch (error) {
    console.error('Error deleting cover letter:', error);
    showMessage('Error deleting cover letter: ' + error.message, 'error');
  }
}

async function clearAllCoverLetters() {
  if (!confirm('Delete ALL saved cover letters? This cannot be undone.')) return;
  
  await chrome.storage.local.set({ savedCoverLetters: [] });
  showMessage('All cover letters deleted', 'success');
  loadCoverLetters();
}

// Initialize cover letters on page load
document.addEventListener('DOMContentLoaded', () => {
  loadCoverLetters();
  
});

// ============================================
// LinkedIn Import Feature
// ============================================

async function importFromLinkedIn() {
  const statusEl = document.getElementById('import-status');
  statusEl.textContent = '🔄 To import from LinkedIn:';
  statusEl.style.color = '#0369a1';
  
  // Show instructions modal
  const modal = document.createElement('div');
  modal.innerHTML = `
    <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;">
      <div style="background: white; padding: 24px; border-radius: 16px; max-width: 500px; width: 90%;">
        <h3 style="margin: 0 0 16px 0; color: #1e40af;">📋 Import from LinkedIn</h3>
        <ol style="padding-left: 20px; line-height: 1.8;">
          <li><strong>Open LinkedIn</strong> in a new tab</li>
          <li>Go to your <strong>Profile page</strong></li>
          <li>Click <strong>"More" → "Save to PDF"</strong> to download your profile</li>
          <li><strong>Open the PDF</strong> and copy all the text</li>
          <li>Paste it in the <strong>Resume Text</strong> field below</li>
          <li>Click <strong>"Parse Resume Text"</strong> to auto-fill!</li>
        </ol>
        <p style="font-size: 12px; color: #64748b; margin: 16px 0;">
          🔒 Your data stays on your device. We never upload it anywhere.
        </p>
        <div style="display: flex; gap: 12px; margin-top: 16px;">
          <button id="linkedin-open-btn" style="flex: 1; padding: 12px; background: #0A66C2; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
            Open LinkedIn Profile
          </button>
          <button id="linkedin-close-btn" style="flex: 1; padding: 12px; background: #f1f5f9; color: #475569; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
            Close
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.querySelector('#linkedin-open-btn').addEventListener('click', () => {
    window.open('https://www.linkedin.com/in/me/', '_blank');
  });
  
  modal.querySelector('#linkedin-close-btn').addEventListener('click', () => {
    modal.remove();
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal.firstElementChild) modal.remove();
  });
  
  statusEl.textContent = '💡 Follow the steps to import your LinkedIn profile';
}

// ============================================
// Resume Parser Feature
// ============================================

async function parseResumeText() {
  const statusEl = document.getElementById('import-status');
  const resumeText = document.getElementById('resume-text')?.value?.trim();
  
  if (!resumeText || resumeText.length < 100) {
    statusEl.textContent = '⚠️ Please paste your resume text in the "Resume (Text Version)" field first';
    statusEl.style.color = '#dc2626';
    
    // Scroll to resume section
    document.getElementById('resume-text')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('resume-text')?.focus();
    return;
  }
  
  statusEl.textContent = '🤖 Parsing resume with AI...';
  statusEl.style.color = '#0369a1';
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'parseResume',
      resumeText
    });
    
    if (response?.error) {
      if (response.error === 'AI not enabled') {
        statusEl.textContent = '⚠️ Enable AI in the AI Settings tab first (requires Perplexity API key)';
      } else {
        statusEl.textContent = '❌ Error: ' + response.error;
      }
      statusEl.style.color = '#dc2626';
      return;
    }
    
    if (response?.success && response.data) {
      const data = response.data;
      let fieldsUpdated = 0;
      
      // Helper to set field if it has value and current field is empty
      const setIfEmpty = (id, value) => {
        const el = document.getElementById(id);
        if (el && value && !el.value) {
          el.value = value;
          el.style.background = '#f0fdf4';
          fieldsUpdated++;
        }
      };
      
      // Basic info
      setIfEmpty('first-name', data.first_name);
      setIfEmpty('last-name', data.last_name);
      setIfEmpty('profile-email', data.email);
      setIfEmpty('profile-phone', data.phone);
      setIfEmpty('profile-location', data.location);
      
      // Auto-generate profile name
      if (data.first_name && data.last_name) {
        setIfEmpty('profile-name', `${data.first_name} ${data.last_name}`);
      }
      
      // Experience
      setIfEmpty('current-title', data.current_title);
      setIfEmpty('years-experience', data.years_experience);
      setIfEmpty('skills', data.skills);
      
      // Education
      setIfEmpty('education-level', data.education_level);
      setIfEmpty('university', data.university);
      setIfEmpty('major', data.major);
      setIfEmpty('gpa', data.gpa);
      
      // Links
      setIfEmpty('linkedin-url', data.linkedin_url);
      setIfEmpty('github-url', data.github_url);
      setIfEmpty('portfolio-url', data.portfolio_url);
      
      statusEl.textContent = `✅ Parsed! ${fieldsUpdated} fields auto-filled. Review and save your profile.`;
      statusEl.style.color = '#16a34a';
      
      showMessage(`Resume parsed! ${fieldsUpdated} fields auto-filled.`, 'success');
    } else {
      statusEl.textContent = '⚠️ Could not parse resume. Try reformatting the text.';
      statusEl.style.color = '#dc2626';
    }
  } catch (error) {
    console.error('Parse error:', error);
    statusEl.textContent = '❌ Error parsing resume: ' + error.message;
    statusEl.style.color = '#dc2626';
  }
}
