// JobRight AI - Popup Script
// Handles popup UI interactions and messaging with content scripts

console.log('JobRight AI: Popup initialized');

let profiles = [];
let activeProfileId = null;
let extensionEnabled = true;

// DOM Elements - Match actual HTML element IDs
const elements = {
  // Toggle & Status
  toggle: document.getElementById('extension-toggle'),
  statusPill: document.getElementById('status-pill'),
  statusText: document.getElementById('status-text'),
  
  // Profile sections
  noProfileState: document.getElementById('no-profile-state'),
  profileDetails: document.getElementById('profile-details'),
  profileSelect: document.getElementById('profile-select'),
  
  // Profile display
  profileDisplayName: document.getElementById('profile-display-name'),
  profileDisplayEmail: document.getElementById('profile-display-email'),
  profileAvatar: document.getElementById('profile-avatar'),
  completenessPercent: document.getElementById('completeness-percent'),
  completenessFill: document.getElementById('completeness-fill'),
  
  // Main action buttons
  buildResumeBtn: document.getElementById('build-resume-btn'),
  resumeBtnText: document.getElementById('resume-btn-text'),
  scanPageBtn: document.getElementById('scan-page-btn'),
  generateCoverLetterBtn: document.getElementById('generate-cover-letter-btn'),
  coverLetterText: document.getElementById('cover-letter-text'),
  
  // Footer links
  settingsLink: document.getElementById('settings-link'),
  helpLink: document.getElementById('help-link'),
  feedbackLink: document.getElementById('feedback-link')
};

// Add toast styles to head
const toastStyles = document.createElement('style');
toastStyles.textContent = `
  .toast {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    z-index: 10000;
    animation: toastSlideUp 0.3s ease;
  }
  .toast-success { background: #10B981; color: white; }
  .toast-error { background: #EF4444; color: white; }
  .toast-warning { background: #F59E0B; color: #0A0F1C; }
  .toast-info { background: #3B82F6; color: white; }
  @keyframes toastSlideUp {
    from { opacity: 0; transform: translateX(-50%) translateY(10px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-right: 6px;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(toastStyles);

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  console.log('JobRight AI: Popup init starting...');
  try {
    await Promise.all([loadProfiles(), loadSettings()]);
    console.log('JobRight AI: Data loaded, profiles:', profiles.length, 'activeProfileId:', activeProfileId);
    renderUI();
    setupEventListeners();
    console.log('JobRight AI: Popup init complete');
  } catch (error) {
    console.error('JobRight AI: Init error:', error);
    showToast('Error loading data', 'error');
  }
}

async function loadProfiles() {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'getAllProfiles' });
    profiles = result || [];
    console.log('JobRight AI: Loaded profiles:', profiles);
  } catch (e) {
    console.error('JobRight AI: Error loading profiles:', e);
    profiles = [];
  }
}

async function loadSettings() {
  try {
    const settings = await chrome.runtime.sendMessage({ type: 'getSettings' });
    console.log('JobRight AI: Loaded settings:', settings);
    activeProfileId = settings?.activeProfileId || null;
    extensionEnabled = settings?.extensionEnabled !== false;
    const autoScanToggle = document.getElementById('auto-scan-toggle');
    if (autoScanToggle) {
      autoScanToggle.checked = settings?.autoScan !== false;
      autoScanToggle.addEventListener('change', () => {
        chrome.runtime.sendMessage({ type: 'updateSettings', settings: { autoScan: autoScanToggle.checked } });
      });
    }
  } catch (e) {
    console.error('JobRight AI: Error loading settings:', e);
    extensionEnabled = true;
  }
}

function renderUI() {
  console.log('JobRight AI: Rendering UI...');
  
  // Toggle state
  if (elements.toggle) {
    elements.toggle.checked = extensionEnabled;
  }
  
  // Status pill
  if (elements.statusPill) {
    elements.statusPill.classList.toggle('inactive', !extensionEnabled);
  }
  if (elements.statusText) {
    elements.statusText.textContent = extensionEnabled ? 'Active' : 'Paused';
  }
  
  // Body class for disabled state
  document.body.classList.toggle('extension-disabled', !extensionEnabled);
  
  // Profile state
  if (profiles.length > 0) {
    // Hide no-profile state, show profile details
    if (elements.noProfileState) elements.noProfileState.style.display = 'none';
    if (elements.profileDetails) elements.profileDetails.style.display = 'block';
    
    // Get active profile or default to first
    let profile = profiles.find(p => p.profile_id === activeProfileId);
    if (!profile) {
      profile = profiles[0];
      activeProfileId = profile.profile_id;
    }
    
    // Populate profile select dropdown
    if (elements.profileSelect) {
      elements.profileSelect.innerHTML = '';
      profiles.forEach(p => {
        const option = document.createElement('option');
        option.value = p.profile_id;
        option.textContent = p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unnamed Profile';
        if (p.profile_id === activeProfileId) option.selected = true;
        elements.profileSelect.appendChild(option);
      });
    }
    
    // Update profile display
    const name = profile.name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'User';
    const initials = getInitials(profile.first_name, profile.last_name);
    
    if (elements.profileDisplayName) elements.profileDisplayName.textContent = name;
    if (elements.profileDisplayEmail) elements.profileDisplayEmail.textContent = profile.email || 'No email';
    if (elements.profileAvatar) elements.profileAvatar.textContent = initials;
    
    // Completeness
    const completeness = calculateCompleteness(profile);
    if (elements.completenessPercent) elements.completenessPercent.textContent = `${completeness}%`;
    if (elements.completenessFill) elements.completenessFill.style.width = `${completeness}%`;
    const hint = document.getElementById('completeness-hint');
    if (hint) hint.textContent = completeness >= 100 ? 'Everything filled — you\'re set' : 'Fill the gaps in Settings to reach 100%';
    const pausedName = document.getElementById('paused-name');
    if (pausedName) pausedName.textContent = name;
    
    // Button text
    if (elements.resumeBtnText) elements.resumeBtnText.textContent = 'Edit Resume';
  } else {
    // Show no-profile state, hide profile details
    if (elements.noProfileState) elements.noProfileState.style.display = 'block';
    if (elements.profileDetails) elements.profileDetails.style.display = 'none';
    if (elements.resumeBtnText) elements.resumeBtnText.textContent = 'Build Resume';
  }
  
  // Button states - enable only if profile exists and extension is enabled
  const hasProfile = activeProfileId && extensionEnabled;
  if (elements.scanPageBtn) elements.scanPageBtn.disabled = !hasProfile;
  if (elements.generateCoverLetterBtn) elements.generateCoverLetterBtn.disabled = !hasProfile;
  
  console.log('JobRight AI: UI rendered, hasProfile:', hasProfile);
}

function getInitials(first, last) {
  return ((first || '').charAt(0) + (last || '').charAt(0)).toUpperCase() || 'JR';
}

function calculateCompleteness(profile) {
  const fields = [
    profile.first_name, profile.last_name, profile.email, profile.phone,
    profile.location, profile.fields?.current_title, profile.fields?.skills,
    profile.resume_text, profile.fields?.education_level
  ];
  const filled = fields.filter(f => f && String(f).trim()).length;
  return Math.round((filled / fields.length) * 100);
}

function setupEventListeners() {
  console.log('JobRight AI: Setting up event listeners...');
  
  // Master toggle
  if (elements.toggle) {
    elements.toggle.addEventListener('change', async (e) => {
      extensionEnabled = e.target.checked;
      console.log('JobRight AI: Toggle changed to:', extensionEnabled);
      
      try {
        await chrome.runtime.sendMessage({
          type: 'updateSettings',
          settings: { extensionEnabled }
        });
        
        // Notify all tabs
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          try {
            await chrome.tabs.sendMessage(tab.id, { type: 'extensionToggle', enabled: extensionEnabled });
          } catch (e) {}
        }
        
        renderUI();
      } catch (error) {
        console.error('JobRight AI: Error updating settings:', error);
        showToast('Error updating settings', 'error');
      }
    });
  }
  
  // Profile select dropdown
  if (elements.profileSelect) {
    elements.profileSelect.addEventListener('change', async (e) => {
      activeProfileId = e.target.value || null;
      console.log('JobRight AI: Profile changed to:', activeProfileId);
      try {
        await chrome.runtime.sendMessage({ type: 'setActiveProfile', profileId: activeProfileId });
        renderUI();
      } catch (error) {
        console.error('JobRight AI: Error setting profile:', error);
        showToast('Error setting profile', 'error');
      }
    });
  }
  
  // Build Resume / Edit Profile button
  if (elements.buildResumeBtn) {
    elements.buildResumeBtn.addEventListener('click', () => {
      console.log('JobRight AI: Build resume clicked');
      chrome.runtime.openOptionsPage();
    });
  }

  // Paused state: Resume button flips the master toggle back on
  document.getElementById('resume-btn')?.addEventListener('click', () => {
    if (elements.toggle) {
      elements.toggle.checked = true;
      elements.toggle.dispatchEvent(new Event('change'));
    }
  });

  // No-profile state: both CTAs open the options page
  document.getElementById('create-profile-btn')?.addEventListener('click', () => chrome.runtime.openOptionsPage());
  document.getElementById('linkedin-import-link')?.addEventListener('click', () => chrome.runtime.openOptionsPage());
  
  // Scan Page / Auto-Fill button
  if (elements.scanPageBtn) {
    elements.scanPageBtn.addEventListener('click', async () => {
      console.log('JobRight AI: Scan page clicked');
      
      if (!extensionEnabled || !activeProfileId) {
        showToast('Select a profile first', 'warning');
        return;
      }
      
      const btn = elements.scanPageBtn;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> Scanning...`;
      
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) throw new Error('No active tab');
        
        console.log('JobRight AI: Sending scan message to tab:', tab.id);
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'scan' });
        console.log('JobRight AI: Scan response:', response);
        
        if (response?.success) {
          showToast('Page scanned!', 'success');
          setTimeout(() => window.close(), 800);
        } else {
          showToast(response?.error || 'Scan failed', 'error');
        }
      } catch (error) {
        console.error('JobRight AI: Scan error:', error);
        if (error.message?.includes('Receiving end does not exist')) {
          showToast('Reload page and try again', 'warning');
        } else {
          showToast('Error scanning page', 'error');
        }
      } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
        </svg> Auto-Fill This Page`;
      }
    });
  }
  
  // Generate Cover Letter button (main button)
  if (elements.generateCoverLetterBtn) {
    elements.generateCoverLetterBtn.addEventListener('click', async () => {
      console.log('JobRight AI: Generate cover letter clicked');
      
      if (!extensionEnabled || !activeProfileId) {
        showToast('Select a profile first', 'warning');
        return;
      }
      
      const btn = elements.generateCoverLetterBtn;
      const textSpan = elements.coverLetterText;
      btn.disabled = true;
      if (textSpan) textSpan.textContent = 'Opening...';
      
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) throw new Error('No active tab');
        
        console.log('JobRight AI: Sending openCoverLetterGenerator to tab:', tab.id);
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'openCoverLetterGenerator' });
        console.log('JobRight AI: Cover letter response:', response);
        
        if (response?.success) {
          showToast('Cover letter generator opened!', 'success');
          setTimeout(() => window.close(), 500);
        } else {
          showToast(response?.error || 'Failed to open generator', 'error');
        }
      } catch (error) {
        console.error('JobRight AI: Cover letter error:', error);
        if (error.message?.includes('Receiving end does not exist')) {
          showToast('Reload page and try again', 'warning');
        } else {
          showToast('Error opening generator', 'error');
        }
      } finally {
        btn.disabled = false;
        if (textSpan) textSpan.textContent = '📝 Generate Cover Letter';
      }
    });
  }
  
  
  // Settings link
  if (elements.settingsLink) {
    elements.settingsLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  }

  // Help link
  if (elements.helpLink) {
    elements.helpLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://github.com/jobright-ai/extension/wiki' });
    });
  }
  
  // Feedback link (if exists)
  if (elements.feedbackLink) {
    elements.feedbackLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://github.com/jobright-ai/extension/issues' });
    });
  }
  
  console.log('JobRight AI: Event listeners setup complete');
}

function showToast(message, type = 'info') {
  console.log('JobRight AI: Toast:', type, message);
  
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.remove(), 3000);
}
