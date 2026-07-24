// Content script - runs on every page
// Enhanced with Workday, Greenhouse, Lever, and other ATS support
console.log('JobRight AI: Content script loaded');

// Detect which ATS platform we're on for optimized handling
function detectATSPlatform(): string | null {
  const url = window.location.href.toLowerCase();
  const hostname = window.location.hostname.toLowerCase();
  
  if (hostname.includes('workday.com') || hostname.includes('myworkday') ||
      hostname.includes('wd3.') || hostname.includes('wd5.') ||
      url.includes('/wd/') || document.querySelector('[data-automation-id]')) {
    return 'workday';
  }
  if (hostname.includes('greenhouse.io') || document.querySelector('#greenhouse_app')) {
    return 'greenhouse';
  }
  if (hostname.includes('lever.co')) {
    return 'lever';
  }
  if (hostname.includes('icims.com') || document.querySelector('[id*="iCIMS"]')) {
    return 'icims';
  }
  if (hostname.includes('taleo')) {
    return 'taleo';
  }
  if (hostname.includes('smartrecruiters.com')) {
    return 'smartrecruiters';
  }
  return null;
}

const currentATS = detectATSPlatform();
console.log('JobRight AI: Detected ATS platform:', currentATS || 'generic');

interface UserProfile {
  profile_id: string;
  name: string;
  first_name?: string;
  last_name?: string;
  email: string;
  phone?: string;
  location?: string;
  country?: string;
  fields: Record<string, string>;
  answers?: Record<string, string>;
  resume_text?: string;
  cover_letter_snippets: Array<{ id: string; title: string; text: string }>;
}

interface DetectedField {
  element: HTMLElement;
  type: string;
  label: string;
  name: string;
  options?: string[];
  isCustom?: boolean;
}

interface Suggestion {
  field: DetectedField;
  value: string;
  confidence: number;
  source: string;
  skipAutoFill?: boolean;
  prevValue?: string;   // value before we filled, for Undo
  undoable?: boolean;
  mask?: boolean;       // credential — render as dots, never editable, never sent to AI
}

let currentProfile: UserProfile | null = null;
let suggestions: Suggestion[] = [];
let aiEnabled = false;
let extensionEnabled = true; // Master on/off toggle
let detectedFields: DetectedField[] = [];
let missingFields: Array<{ label: string; suggestedKey: string }> = [];
let extractedJobDescription: string = '';

// Initialize
init();

async function init() {
  console.log('JobRight AI: Initializing...');
  
  try {
    const enabled = await sendMessage({ type: 'isEnabled' });
    if (!enabled) return;

    // Check AI settings and extension state
    const settings = await sendMessage({ type: 'getSettings' });
    aiEnabled = settings.aiEnabled && settings.hasApiKey;
    extensionEnabled = settings.extensionEnabled !== false; // Default to true
    console.log('JobRight AI: AI enabled:', aiEnabled);
    console.log('JobRight AI: Extension enabled:', extensionEnabled);

    const profileId = await sendMessage({ type: 'getActiveProfile' });
    if (profileId) {
      currentProfile = await sendMessage({ type: 'getProfile', profileId });
      console.log('JobRight AI: Profile loaded:', currentProfile?.name);
    }

    await loadAccountCreds();

    // Auto-scan on recognized ATS pages (Workday, Greenhouse, ...) so the user
    // never has to open the popup. Off via the popup's Auto-scan toggle.
    if (currentProfile && extensionEnabled && settings.autoScan !== false && currentATS) {
      setTimeout(() => scanPage(true), 300);
    }

  } catch (error) {
    console.error('JobRight AI: Init error:', error);
  }
}

function sendMessage(message: any): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('JobRight AI: Received message:', message.type);
  
  if (message.type === 'scan') {
    handleScan().then(result => {
      sendResponse(result);
    }).catch(error => {
      sendResponse({ success: false, error: String(error) });
    });
    return true;
  }
  
  // Handle extension toggle
  if (message.type === 'extensionToggle') {
    extensionEnabled = message.enabled;
    console.log('JobRight AI: Extension toggled:', extensionEnabled);
    
    // Remove overlay if extension is turned off
    if (!extensionEnabled) {
      const existingOverlay = document.getElementById('jobright-overlay');
      if (existingOverlay) {
        existingOverlay.remove();
      }
      showMessage('JobRight AI paused', 'info');
    }
    
    sendResponse({ success: true });
    return true;
  }
  
  // Handle open cover letter generator from popup
  if (message.type === 'openCoverLetterGenerator') {
    if (!extensionEnabled) {
      sendResponse({ success: false, error: 'Extension is disabled' });
      return true;
    }
    
    // Open the cover letter generator modal
    showCoverLetterGenerator();
    sendResponse({ success: true });
    return true;
  }
  
  return false;
});

async function handleScan() {
  // Check if extension is enabled
  if (!extensionEnabled) {
    showMessage('Extension is OFF. Turn it on in the popup to scan.', 'warning');
    return { success: false, error: 'Extension is disabled' };
  }
  
  const profileId = await sendMessage({ type: 'getActiveProfile' });
  if (profileId) {
    currentProfile = await sendMessage({ type: 'getProfile', profileId });
  }
  await loadAccountCreds();

  // Reload AI and extension settings
  const settings = await sendMessage({ type: 'getSettings' });
  aiEnabled = settings.aiEnabled && settings.hasApiKey;
  extensionEnabled = settings.extensionEnabled !== false;
  
  if (!extensionEnabled) {
    showMessage('Extension is OFF. Turn it on in the popup to scan.', 'warning');
    return { success: false, error: 'Extension is disabled' };
  }
  
  if (!currentProfile) {
    showMessage('Please select a profile first!', 'warning');
    return { success: false, error: 'No profile selected' };
  }
  
  await scanPage();
  return { success: true };
}

// Re-scan automatically when an SPA (Workday's multi-step flow, Greenhouse, etc.)
// swaps in a new step without a page load. Only after the user has scanned once,
// so the overlay never appears uninvited.
let hasScanned = false;
let lastScanUrl = '';
let rescanTimer: number | undefined;
let autoScanRetries = 0;

// ===== ATS account credentials (Workday & co. force an account per company).
// Stored in chrome.storage.local via Options -> ATS Account; never hardcoded.
let accountCreds = { email: '', password: '' };
let accountRegistry: Record<string, { email: string; createdAt: number }> = {};
let usingSavedAccountFor: string | null = null;

function accountDomainKey(): string {
  return location.hostname.replace(/^www\./, '');
}

async function loadAccountCreds() {
  try {
    const acc = await chrome.storage.local.get(['qaAccountEmail', 'qaAccountPassword', 'qaAccounts']);
    accountCreds = { email: acc.qaAccountEmail || '', password: acc.qaAccountPassword || '' };
    accountRegistry = acc.qaAccounts || {};
  } catch (e) {}
}

// After credentials are actually filled on this domain, remember the account
// so future visits show "saved login" instead of creating a duplicate.
function registerAccountIfNeeded(suggestion: Suggestion) {
  if (!suggestion.mask || !accountCreds.email) return;
  const key = accountDomainKey();
  if (!accountRegistry[key]) {
    accountRegistry[key] = { email: accountCreds.email, createdAt: Date.now() };
    try { chrome.storage.local.set({ qaAccounts: accountRegistry }); } catch (e) {}
  }
}

function watchForSpaNavigation() {
  lastScanUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastScanUrl) {
      lastScanUrl = location.href;
      if (!hasScanned || !extensionEnabled || !currentProfile) return;
      clearTimeout(rescanTimer);
      // Short settle; scanPage(true) retries on its own if the step hasn't rendered yet
      rescanTimer = window.setTimeout(() => scanPage(true), 600);
    }
  }).observe(document.documentElement, { subtree: true, childList: true });
}
watchForSpaNavigation();

async function scanPage(auto = false) {
  console.log('JobRight AI: Scanning page...');
  hasScanned = true;
  lastScanUrl = location.href;

  const fields = findFormFields();
  console.log('JobRight AI: Found', fields.length, 'fields');
  
  // Debug: log what was found
  fields.forEach(f => {
    console.log('JobRight AI: Field:', f.type, '|', f.label.substring(0, 50));
  });
  
  let effectiveFields = fields;
  if (effectiveFields.length === 0) {
    effectiveFields = findFormFieldsAdvanced();
    console.log('JobRight AI: Advanced scan found', effectiveFields.length, 'fields');
  }

  if (effectiveFields.length === 0) {
    if (auto) {
      // SPA still hydrating — retry briefly instead of giving up
      if (autoScanRetries < 4) {
        autoScanRetries++;
        setTimeout(() => scanPage(true), 800);
      }
    } else {
      showEmptyState();
    }
    return;
  }
  autoScanRetries = 0;

  suggestions = await generateSuggestions(effectiveFields);
  showOverlay();
}

function findFormFields(): DetectedField[] {
  const fields: DetectedField[] = [];
  const processedRadios = new Set<HTMLInputElement>();
  const processedElements = new Set<HTMLElement>();
  
  // WORKDAY-SPECIFIC: Find Workday form fields first
  if (currentATS === 'workday') {
    console.log('JobRight AI: Using Workday-specific detection');
    const workdayFields = findWorkdayFields();
    workdayFields.forEach(f => {
      if (!processedElements.has(f.element)) {
        processedElements.add(f.element);
        fields.push(f);
      }
    });
  }
  
  // First, find and group all radio buttons by their question/container
  const radioGroups = findRadioButtonGroups();
  radioGroups.forEach(group => {
    group.radios.forEach(r => processedRadios.add(r));
    if (!processedElements.has(group.radios[0])) {
      fields.push({
        element: group.radios[0],
        type: 'radio',
        label: group.questionText,
        name: group.name,
        options: group.options
      });
    }
  });
  
  // Standard inputs (excluding radios and checkboxes for special handling)
  document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]):not([type="radio"]):not([type="checkbox"])').forEach(el => {
    const input = el as HTMLInputElement;
    if (isVisible(input) && !processedElements.has(input)) {
      processedElements.add(input);
      fields.push({
        element: input,
        type: input.type || 'text',
        label: getLabel(input),
        name: input.name || input.id || ''
      });
    }
  });
  
  // SHADOW DOM support - find inputs in shadow roots
  findInputsInShadowDOM().forEach(input => {
    if (!processedElements.has(input)) {
      processedElements.add(input);
      fields.push({
        element: input,
        type: (input as HTMLInputElement).type || 'text',
        label: getLabel(input),
        name: (input as HTMLInputElement).name || input.id || ''
      });
    }
  });
  
  // Checkboxes
  document.querySelectorAll('input[type="checkbox"]').forEach(el => {
    const checkbox = el as HTMLInputElement;
    if (isVisible(checkbox)) {
      fields.push({
        element: checkbox,
        type: 'checkbox',
        label: getLabel(checkbox),
        name: checkbox.name || checkbox.id || '',
        options: ['Yes', 'No']
      });
    }
  });
  
  // Textareas
  document.querySelectorAll('textarea').forEach(el => {
    const textarea = el as HTMLTextAreaElement;
    if (isVisible(textarea)) {
      fields.push({
        element: textarea,
        type: 'textarea',
        label: getLabel(textarea),
        name: textarea.name || textarea.id || ''
      });
    }
  });
  
  // Native selects
  document.querySelectorAll('select').forEach(el => {
    const select = el as HTMLSelectElement;
    if (isVisible(select)) {
      const options = Array.from(select.options).map(o => o.text.trim()).filter(t => t);
      fields.push({
        element: select,
        type: 'select',
        label: getLabel(select),
        name: select.name || select.id || '',
        options
      });
    }
  });
  
  // Custom dropdowns - common patterns
  const customDropdowns = findCustomDropdowns();
  fields.push(...customDropdowns);
  
  return fields;
}

// Find and group radio buttons by their associated question
function findRadioButtonGroups(): Array<{radios: HTMLInputElement[], name: string, questionText: string, options: string[]}> {
  const groups: Array<{radios: HTMLInputElement[], name: string, questionText: string, options: string[]}> = [];
  const processedRadios = new Set<HTMLInputElement>();
  
  console.log('JobRight AI: Finding radio button groups...');
  
  // Get all visible radios first
  const allRadios = Array.from(document.querySelectorAll('input[type="radio"]'))
    .filter(r => isVisible(r as HTMLInputElement)) as HTMLInputElement[];
  
  console.log('JobRight AI: Total visible radios:', allRadios.length);
  
  // Method 1: Group by name attribute
  const namedGroups = new Map<string, HTMLInputElement[]>();
  allRadios.forEach(radio => {
    if (radio.name && !processedRadios.has(radio)) {
      if (!namedGroups.has(radio.name)) {
        namedGroups.set(radio.name, []);
      }
      namedGroups.get(radio.name)!.push(radio);
    }
  });
  
  console.log('JobRight AI: Named groups:', namedGroups.size);
  
  namedGroups.forEach((radios, name) => {
    radios.forEach(r => processedRadios.add(r));
    const questionText = findQuestionForRadios(radios);
    const options = radios.map(r => getRadioLabel(r));
    console.log('JobRight AI: Radio group (by name):', name, '| Question:', questionText.substring(0, 50));
    groups.push({ radios, name, questionText, options });
  });
  
  // Method 2: Find Yes/No pairs by proximity
  const unprocessedRadios = allRadios.filter(r => !processedRadios.has(r));
  console.log('JobRight AI: Unprocessed radios:', unprocessedRadios.length);
  
  // Group by Y position (radios on same line are likely a group)
  const radiosByRow = new Map<number, HTMLInputElement[]>();
  unprocessedRadios.forEach(radio => {
    const rect = radio.getBoundingClientRect();
    const rowKey = Math.round(rect.top / 10) * 10; // Group within 10px
    if (!radiosByRow.has(rowKey)) {
      radiosByRow.set(rowKey, []);
    }
    radiosByRow.get(rowKey)!.push(radio);
  });
  
  radiosByRow.forEach((radios, rowKey) => {
    if (radios.every(r => processedRadios.has(r))) return;
    
    radios.forEach(r => processedRadios.add(r));
    const questionText = findQuestionForRadios(radios);
    const options = radios.map(r => getRadioLabel(r));
    console.log('JobRight AI: Radio group (by row):', rowKey, '| Question:', questionText.substring(0, 50));
    groups.push({ 
      radios, 
      name: radios[0].name || `radio_row_${groups.length}`, 
      questionText, 
      options 
    });
  });
  
  // Method 3: For any remaining, group by parent container
  allRadios.filter(r => !processedRadios.has(r)).forEach(radio => {
    // Try multiple container levels
    let container = radio.parentElement;
    let depth = 0;
    while (container && depth < 5) {
      const siblingRadios = Array.from(container.querySelectorAll('input[type="radio"]'))
        .filter(r => !processedRadios.has(r as HTMLInputElement)) as HTMLInputElement[];
      
      if (siblingRadios.length >= 2) {
        siblingRadios.forEach(r => processedRadios.add(r));
        const questionText = findQuestionForRadios(siblingRadios);
        const options = siblingRadios.map(r => getRadioLabel(r));
        console.log('JobRight AI: Radio group (by container):', container.tagName, '| Question:', questionText.substring(0, 50));
        groups.push({ 
          radios: siblingRadios, 
          name: siblingRadios[0].name || `radio_container_${groups.length}`, 
          questionText, 
          options 
        });
        break;
      }
      container = container.parentElement;
      depth++;
    }
  });
  
  // Method 4: Final pass - any remaining single radios
  allRadios.filter(r => !processedRadios.has(r)).forEach(radio => {
    processedRadios.add(radio);
    const questionText = getLabel(radio);
    console.log('JobRight AI: Single radio:', questionText.substring(0, 50));
    groups.push({
      radios: [radio],
      name: radio.name || `radio_single_${groups.length}`,
      questionText,
      options: [getRadioLabel(radio)]
    });
  });
  
  console.log('JobRight AI: Total radio groups found:', groups.length);
  return groups;
}

// Find the question text associated with radio buttons
function findQuestionForRadios(radios: HTMLInputElement[]): string {
  const firstRadio = radios[0];
  const radioRect = firstRadio.getBoundingClientRect();
  
  // Method 1: Look for text directly above the radios
  // Walk up the DOM and look for preceding text
  let current: Element | null = firstRadio;
  let depth = 0;
  
  while (current && depth < 8) {
    // Check previous siblings for question text
    let sibling = current.previousElementSibling;
    while (sibling) {
      const text = sibling.textContent?.trim() || '';
      if (text.length > 15 && !text.match(/^(yes|no)$/i)) {
        // Check if this element is actually above the radios
        const sibRect = sibling.getBoundingClientRect();
        if (sibRect.bottom <= radioRect.top + 50) {
          return text.replace(/\*/g, '').trim().substring(0, 500);
        }
      }
      sibling = sibling.previousElementSibling;
    }
    
    current = current.parentElement;
    depth++;
  }
  
  // Method 2: Look in container patterns
  const containers = [
    firstRadio.closest('fieldset'),
    firstRadio.closest('.form-group'),
    firstRadio.closest('.question'),
    firstRadio.closest('[class*="question"]'),
    firstRadio.closest('[class*="field"]'),
    firstRadio.closest('li'),
    firstRadio.closest('div'),
  ];
  
  for (const container of containers) {
    if (!container) continue;
    
    // Look for legend
    const legend = container.querySelector('legend');
    if (legend) {
      const text = legend.textContent?.trim() || '';
      if (text.length > 10) return text.replace(/\*/g, '').trim();
    }
    
    // Look for label or question text
    const textElements = container.querySelectorAll('label, span, p, div, strong, b');
    for (const textEl of Array.from(textElements)) {
      // Skip if this element contains the radios
      if (textEl.querySelector('input[type="radio"]')) continue;
      
      const text = textEl.textContent?.trim() || '';
      // Skip option labels (Yes/No)
      if (text.match(/^(yes|no|true|false)$/i)) continue;
      
      if (text.length > 15) {
        const elRect = textEl.getBoundingClientRect();
        // Text should be above or at same level as radios
        if (elRect.top <= radioRect.top + 10) {
          return text.replace(/\*/g, '').trim().substring(0, 500);
        }
      }
    }
  }
  
  // Method 3: Search all text above the radio
  const allTextElements = document.querySelectorAll('label, span, p, div, h1, h2, h3, h4, h5, h6, strong, b, legend');
  let closestText = '';
  let closestDistance = Infinity;
  
  for (const el of Array.from(allTextElements)) {
    const text = el.textContent?.trim() || '';
    if (text.length < 15 || text.match(/^(yes|no|true|false)$/i)) continue;
    if ((el as HTMLElement).querySelector?.('input[type="radio"]')) continue;
    
    const elRect = el.getBoundingClientRect();
    // Must be above the radio
    if (elRect.bottom > radioRect.top) continue;
    
    const distance = radioRect.top - elRect.bottom;
    // Within 100px above
    if (distance < 100 && distance < closestDistance) {
      // Make sure horizontally close too
      const horizontalOverlap = Math.max(0, 
        Math.min(elRect.right, radioRect.right + 200) - Math.max(elRect.left, radioRect.left - 200)
      );
      if (horizontalOverlap > 0) {
        closestDistance = distance;
        closestText = text;
      }
    }
  }
  
  if (closestText) {
    return closestText.replace(/\*/g, '').trim().substring(0, 500);
  }
  
  // Fallback to getLabel
  return getLabel(firstRadio);
}

// Get label for a single radio button
function getRadioLabel(radio: HTMLInputElement): string {
  // 1. label[for]
  if (radio.id) {
    const label = document.querySelector(`label[for="${radio.id}"]`);
    if (label) return label.textContent?.trim() || radio.value;
  }
  
  // 2. Parent label
  const parentLabel = radio.closest('label');
  if (parentLabel) {
    // Get text without nested elements' text
    const clone = parentLabel.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('input').forEach(i => i.remove());
    return clone.textContent?.trim() || radio.value;
  }
  
  // 3. Adjacent sibling
  const next = radio.nextSibling;
  if (next && next.nodeType === Node.TEXT_NODE) {
    return next.textContent?.trim() || radio.value;
  }
  
  const nextEl = radio.nextElementSibling;
  if (nextEl) {
    return nextEl.textContent?.trim() || radio.value;
  }
  
  // 4. Value attribute
  return radio.value || 'Unknown';
}

function findCustomDropdowns(): DetectedField[] {
  const fields: DetectedField[] = [];
  
  // Pattern 1: Elements with role="combobox" or role="listbox"
  document.querySelectorAll('[role="combobox"], [role="listbox"], [aria-haspopup="listbox"]').forEach(el => {
    const element = el as HTMLElement;
    if (isVisible(element)) {
      fields.push({
        element,
        type: 'custom-select',
        label: getLabel(element),
        name: element.id || element.getAttribute('name') || '',
        isCustom: true
      });
    }
  });
  
  // Pattern 2: Common dropdown class names
  const dropdownSelectors = [
    '[class*="select"]',
    '[class*="dropdown"]',
    '[class*="Dropdown"]',
    '[class*="Select"]',
    '[class*="picker"]',
    '[class*="Picker"]',
    '[data-testid*="select"]',
    '[data-testid*="dropdown"]',
  ];
  
  dropdownSelectors.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(el => {
        const element = el as HTMLElement;
        // Check if it looks like a dropdown (has text like "Select" or "Choose")
        const text = element.textContent?.toLowerCase() || '';
        if (isVisible(element) && 
            (text.includes('select') || text.includes('choose') || text.includes('option')) &&
            !fields.some(f => f.element === element || f.element.contains(element) || element.contains(f.element))) {
          
          // Try to find the label
          const label = getLabel(element);
          if (label && label.length > 3 && label.length < 200) {
            fields.push({
              element,
              type: 'custom-select',
              label,
              name: element.id || '',
              isCustom: true
            });
          }
        }
      });
    } catch (e) {
      // Ignore selector errors
    }
  });
  
  // Pattern 3: Look for question containers with "Select" text
  document.querySelectorAll('div, span, label').forEach(el => {
    const element = el as HTMLElement;
    const text = element.textContent?.trim() || '';
    
    // Look for question patterns
    if (text.includes('?') && text.length > 10 && text.length < 300) {
      // Check if there's a "Select One" or similar nearby
      const parent = element.parentElement;
      if (parent) {
        const selectText = parent.textContent?.toLowerCase() || '';
        if (selectText.includes('select one') || selectText.includes('select an option') || selectText.includes('choose')) {
          // Find the clickable element
          const clickable = parent.querySelector('button, [role="button"], [tabindex], [class*="select"], [class*="dropdown"]') as HTMLElement;
          if (clickable && isVisible(clickable) && !fields.some(f => f.element === clickable)) {
            fields.push({
              element: clickable,
              type: 'custom-select',
              label: text.replace(/\*/g, '').trim(),
              name: '',
              isCustom: true
            });
          }
        }
      }
    }
  });
  
  return fields;
}

// WORKDAY-SPECIFIC field detection
function findWorkdayFields(): DetectedField[] {
  const fields: DetectedField[] = [];
  
  // Workday uses specific data-automation-id attributes
  const workdaySelectors = [
    '[data-automation-id="textInputBox"] input',
    '[data-automation-id="searchBox"] input',
    '[data-automation-id="dateInputBox"] input',
    '[data-automation-id="numericInputBox"] input',
    '[data-automation-id*="richTextArea"] textarea',
    '[data-automation-id*="richTextArea"] [contenteditable="true"]',
    '[data-automation-id="multiselectInputContainer"]',
    '[data-automation-id="selectInputContainer"]',
    '[data-uxi-widget-type="selectinput"]',
    '[data-automation-id*="dropdown"]',
    '[data-automation-id] input[type="text"]',
    '[data-automation-id] textarea',
    'div[contenteditable="true"][role="textbox"]',
  ];
  
  workdaySelectors.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(el => {
        const element = el as HTMLElement;
        if (!isVisible(element)) return;
        
        const label = getWorkdayLabel(element);
        if (label && label.length > 2) {
          const isSelect = selector.includes('select') || selector.includes('dropdown');
          fields.push({
            element,
            type: isSelect ? 'select' : ((element as HTMLTextAreaElement).tagName === 'TEXTAREA' ? 'textarea' : 'text'),
            label: label.replace(/\*$/, '').trim(),
            name: element.getAttribute('data-automation-id') || element.id || '',
            isCustom: isSelect
          });
        }
      });
    } catch (e) {}
  });
  
  return fields;
}

function getWorkdayLabel(element: HTMLElement): string {
  // Find the form field container
  const container = element.closest('[data-automation-id*="formField"]') ||
                   element.closest('[data-automation-id*="section"]') ||
                   element.closest('.WM4P, .WGVO') ||
                   element.parentElement?.parentElement?.parentElement;
  
  if (container) {
    // Look for label elements
    const labelSelectors = [
      '[data-automation-id*="label"]',
      '[data-automation-id*="Label"]',
      '.gwt-Label',
      '[data-uxi-widget-type="selectinputlabel"]',
      'label',
      '.WEOC', '.WE0F',
    ];
    
    for (const selector of labelSelectors) {
      const label = container.querySelector(selector);
      if (label) {
        const text = label.textContent?.trim();
        if (text && text.length > 2 && text.length < 300) {
          return text;
        }
      }
    }
  }
  
  // Try aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;
  
  // Look for preceding siblings
  let sibling = element.previousElementSibling;
  let depth = 0;
  while (sibling && depth < 3) {
    const text = sibling.textContent?.trim();
    if (text && text.length > 2 && text.length < 200) {
      return text;
    }
    sibling = sibling.previousElementSibling;
    depth++;
  }
  
  return '';
}

// Find inputs in Shadow DOM
function findInputsInShadowDOM(): HTMLElement[] {
  const inputs: HTMLElement[] = [];
  
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, null);
  let node: Node | null = walker.currentNode;
  
  while (node = walker.nextNode()) {
    const element = node as Element;
    
    // Check for open shadow root
    if (element.shadowRoot) {
      element.shadowRoot.querySelectorAll('input, textarea, select, [role="textbox"], [role="combobox"]').forEach(el => {
        if (isVisible(el as HTMLElement)) {
          inputs.push(el as HTMLElement);
        }
      });
    }
    
    // Check custom elements
    if (element.tagName.includes('-')) {
      try {
        const shadowRoot = (element as any).shadowRoot;
        if (shadowRoot) {
          shadowRoot.querySelectorAll('input, textarea, select').forEach((el: Element) => {
            if (isVisible(el as HTMLElement)) {
              inputs.push(el as HTMLElement);
            }
          });
        }
      } catch (e) {}
    }
  }
  
  return inputs;
}

function findFormFieldsAdvanced(): DetectedField[] {
  const fields: DetectedField[] = [];
  
  // Look for question-like text patterns
  const questionPatterns = [
    /authorized.*work/i,
    /require.*sponsorship/i,
    /visa.*permit/i,
    /work.*visa/i,
    /in.*office/i,
    /remote/i,
    /years.*experience/i,
    /education/i,
    /degree/i,
    /salary/i,
    /start.*date/i,
    /available/i,
    /willing.*relocate/i,
    /citizenship/i,
    /legally.*authorized/i,
  ];
  
  // Find all text containers that look like questions
  document.querySelectorAll('label, span, div, p, h1, h2, h3, h4, h5, h6, legend').forEach(el => {
    const element = el as HTMLElement;
    const text = element.textContent?.trim() || '';
    
    if (text.length < 10 || text.length > 500) return;
    if (!isVisible(element)) return;
    
    // Check if it matches question patterns
    const isQuestion = text.includes('?') || questionPatterns.some(p => p.test(text));
    
    if (isQuestion) {
      // Look for nearby interactive elements
      const container = element.closest('div, fieldset, section, article') || element.parentElement;
      if (!container) return;
      
      // Find selects, inputs, or custom components
      const interactiveEl = container.querySelector(
        'select, input:not([type="hidden"]), textarea, ' +
        '[role="combobox"], [role="listbox"], [role="button"], ' +
        'button, [tabindex="0"], [class*="select"], [class*="dropdown"]'
      ) as HTMLElement;
      
      if (interactiveEl && isVisible(interactiveEl) && !fields.some(f => f.element === interactiveEl)) {
        const isNativeSelect = interactiveEl.tagName === 'SELECT';
        const isInput = interactiveEl.tagName === 'INPUT';
        
        fields.push({
          element: interactiveEl,
          type: isNativeSelect ? 'select' : (isInput ? (interactiveEl as HTMLInputElement).type : 'custom-select'),
          label: text.replace(/\*/g, '').trim(),
          name: interactiveEl.id || interactiveEl.getAttribute('name') || '',
          isCustom: !isNativeSelect && !isInput
        });
      }
    }
  });
  
  return fields;
}

function isVisible(el: HTMLElement): boolean {
  if (!el) return false;
  
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function getLabel(el: HTMLElement): string {
  // Check for label[for]
  const id = el.id;
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label) return label.textContent?.trim() || '';
  }
  
  // Check parent label
  const parentLabel = el.closest('label');
  if (parentLabel) return parentLabel.textContent?.trim() || '';
  
  // Check aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;
  
  // Check aria-labelledby
  const ariaLabelledBy = el.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const labelEl = document.getElementById(ariaLabelledBy);
    if (labelEl) return labelEl.textContent?.trim() || '';
  }
  
  // Check placeholder
  const placeholder = el.getAttribute('placeholder');
  if (placeholder) return placeholder;
  
  // Look for nearby text in parent containers
  let current: HTMLElement | null = el;
  for (let i = 0; i < 5; i++) {
    current = current?.parentElement || null;
    if (!current) break;
    
    // Look for label, legend, or heading
    const labelEl = current.querySelector('label, legend, h1, h2, h3, h4, h5, h6');
    if (labelEl && labelEl !== el) {
      const text = labelEl.textContent?.trim();
      if (text && text.length > 3 && text.length < 200) {
        return text;
      }
    }
    
    // Look for text that ends with ? (question)
    const allText = current.textContent?.trim() || '';
    if (allText.includes('?')) {
      const questionMatch = allText.match(/([^.!?\n]+\?)/);
      if (questionMatch) {
        return questionMatch[1].trim();
      }
    }
    
    // Look for preceding text node or span
    const prevSibling = el.previousElementSibling;
    if (prevSibling) {
      const text = prevSibling.textContent?.trim();
      if (text && text.length > 3 && text.length < 200) {
        return text;
      }
    }
  }
  
  return el.getAttribute('name') || el.id || 'Unknown field';
}

// ===== Answer cache: application questions repeat, so an AI answer is paid for
// once and instant forever after. Persisted in chrome.storage.local. =====
let answerCache: Record<string, { value: string; ts: number }> = {};
let answerCacheLoaded = false;
let pendingAIFields: DetectedField[] = [];

// Only free-text fields can be essays — a dropdown matching "this position"
// is still a dropdown and must use normal matching.
function isEssayField(field: DetectedField): boolean {
  return field.type === 'textarea' || (field.type === 'text' && isOpenEndedQuestionLabel(field.label));
}

function answerCacheKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

async function loadAnswerCache() {
  if (answerCacheLoaded) return;
  try {
    const res = await chrome.storage.local.get('qaAnswerCache');
    answerCache = res.qaAnswerCache || {};
  } catch (e) {
    answerCache = {};
  }
  answerCacheLoaded = true;
}

function saveAnswerToCache(label: string, value: string) {
  answerCache[answerCacheKey(label)] = { value, ts: Date.now() };
  try { chrome.storage.local.set({ qaAnswerCache: answerCache }); } catch (e) {}
}

// Local-only, no awaited AI: the overlay must render instantly. Fields that
// genuinely need Claude go to pendingAIFields and resolve in the background.
async function generateSuggestions(fields: DetectedField[]): Promise<Suggestion[]> {
  if (!currentProfile) return [];
  await loadAnswerCache();

  const result: Suggestion[] = [];
  missingFields = [];
  pendingAIFields = [];

  const domain = window.location.hostname;
  let learnedMappings: Array<{ pattern: string; value: string }> = [];
  try {
    learnedMappings = await sendMessage({ type: 'getLearnedMappings', domain }) || [];
  } catch (e) {
    console.log('JobRight AI: Could not load learned mappings');
  }

  // Account walls: a page with a password field is a create-account or sign-in
  // page. Credentials come ONLY from the ATS Account store, never from AI.
  const pageHasPassword = fields.some(f => f.type === 'password');
  const savedAccount = accountRegistry[accountDomainKey()];
  usingSavedAccountFor = pageHasPassword && savedAccount ? accountDomainKey() : null;

  for (const field of fields) {
    if (field.type === 'password') {
      if (accountCreds.password) {
        result.push({
          field, value: accountCreds.password, confidence: 0.97,
          source: savedAccount ? 'account · saved login' : 'account · new',
          mask: true
        });
      } else {
        missingFields.push({ label: field.label || 'Password', suggestedKey: 'Account password — Settings → ATS Account' });
      }
      continue;
    }
    if (pageHasPassword && accountCreds.email && /e-?mail|user.?name|login/i.test(`${field.label} ${field.name}`)) {
      result.push({
        field, value: accountCreds.email, confidence: 0.97,
        source: savedAccount ? 'account · saved login' : 'account'
      });
      continue;
    }
    const isOpenEndedQuestion = isEssayField(field);
    const cached = answerCache[answerCacheKey(field.label)];

    let suggestion = checkLearnedMapping(field, learnedMappings) || matchField(field);

    // Essay questions must come from the answers bank, a learned correction,
    // or Claude — a generic pattern match would be a wrong essay.
    if (isOpenEndedQuestion && suggestion &&
        !suggestion.source.startsWith('answers.') && !suggestion.source.includes('Learned')) {
      suggestion = null;
    }

    if (!suggestion && cached) {
      suggestion = { field, value: cached.value, confidence: 0.88, source: 'Claude · cached' };
    }

    if (suggestion) {
      result.push(suggestion);
      continue;
    }

    const combined = `${field.label} ${field.name}`.toLowerCase();
    const aiEligible = aiEnabled && field.label.length > (isOpenEndedQuestion ? 10 : 5) &&
      !isSensitiveField(combined) && !isDirectProfileField(combined);

    if (aiEligible) {
      pendingAIFields.push(field); // answered in parallel after the overlay shows
    } else if (field.label.length > 3) {
      const suggestedKey = detectMissingFieldKey(field.label, field.name);
      if (suggestedKey) missingFields.push({ label: field.label, suggestedKey });
    }
  }

  return result;
}

// Check if we have a learned mapping for this field
function checkLearnedMapping(
  field: DetectedField, 
  learnedMappings: Array<{ pattern: string; value: string }>
): Suggestion | null {
  if (learnedMappings.length === 0) return null;
  
  const fieldPattern = createLearnedPattern(field.label, field.name);
  
  for (const mapping of learnedMappings) {
    // Check if patterns are similar enough
    const words1 = fieldPattern.split(' ');
    const words2 = mapping.pattern.split(' ');
    const commonWords = words1.filter(w => words2.includes(w));
    
    // If 60%+ words match, use this learned value
    if (commonWords.length >= Math.min(words1.length, words2.length) * 0.6) {
      return {
        field,
        value: mapping.value,
        confidence: 0.98,
        source: 'Learned'
      };
    }
  }
  
  return null;
}

// Detect what profile field should be added for this question
function detectMissingFieldKey(label: string, name: string): string {
  const combined = `${label} ${name}`.toLowerCase();
  
  const keyMappings: Array<{ patterns: RegExp[]; key: string; display: string }> = [
    { patterns: [/linkedin/i], key: 'linkedin_url', display: 'LinkedIn URL' },
    { patterns: [/github/i], key: 'github_url', display: 'GitHub URL' },
    { patterns: [/portfolio/i, /website/i], key: 'portfolio_url', display: 'Portfolio URL' },
    { patterns: [/salary.*expect/i, /expected.*salary/i, /desired.*salary/i], key: 'expected_salary', display: 'Expected Salary' },
    { patterns: [/current.*salary/i], key: 'current_salary', display: 'Current Salary' },
    { patterns: [/years.*experience/i, /experience.*years/i], key: 'years_experience', display: 'Years of Experience' },
    { patterns: [/start.*date/i, /available/i, /notice/i], key: 'start_date', display: 'Start Date' },
    { patterns: [/why.*interest/i, /why.*role/i, /why.*apply/i], key: 'answers.why_interested', display: 'Answer: Why interested?' },
    { patterns: [/why.*company/i, /why.*us/i, /why.*here/i], key: 'answers.why_company', display: 'Answer: Why this company?' },
    { patterns: [/tell.*yourself/i, /about.*yourself/i], key: 'answers.about_yourself', display: 'Answer: About yourself' },
    { patterns: [/strength/i], key: 'answers.strengths', display: 'Answer: Strengths' },
    { patterns: [/weakness/i, /improve/i], key: 'answers.weaknesses', display: 'Answer: Weaknesses' },
    { patterns: [/leadership/i, /led.*team/i, /manage/i], key: 'answers.leadership', display: 'Answer: Leadership' },
    { patterns: [/challenge/i, /difficult/i, /overcome/i], key: 'answers.challenge', display: 'Answer: Challenge' },
    { patterns: [/achievement/i, /accomplishment/i, /proud/i], key: 'answers.achievement', display: 'Answer: Achievement' },
    { patterns: [/5.*years/i, /future/i, /goal/i], key: 'answers.future_goals', display: 'Answer: Future goals' },
    { patterns: [/cover.*letter/i], key: 'cover_letter', display: 'Cover Letter' },
    { patterns: [/university/i, /college/i, /school/i], key: 'university', display: 'University' },
    { patterns: [/major/i, /field.*study/i], key: 'major', display: 'Major' },
    { patterns: [/gpa/i, /grade/i], key: 'gpa', display: 'GPA' },
    { patterns: [/education/i, /degree/i], key: 'education_level', display: 'Education Level' },
  ];
  
  for (const mapping of keyMappings) {
    if (mapping.patterns.some(p => p.test(combined))) {
      return mapping.display;
    }
  }
  
  // Generic suggestion based on the field name
  if (label.length > 10) {
    return `Custom field for: "${label.substring(0, 30)}..."`;
  }
  
  return '';
}

async function tryAIMatch(field: DetectedField): Promise<Suggestion | null> {
  const combined = `${field.label} ${field.name}`.toLowerCase();
  
  // NEVER use AI for sensitive fields or direct profile fields
  if (isSensitiveField(combined) || isDirectProfileField(combined)) {
    console.log('JobRight AI: Skipping AI for sensitive/direct field:', field.label);
    return null;
  }
  
  // NEVER use AI for Yes/No radio questions - they should be answered with Yes or No only
  if (field.type === 'radio' && field.options) {
    const optionsLower = field.options.map(o => o.toLowerCase());
    const isYesNoQuestion = optionsLower.some(o => o.includes('yes')) && optionsLower.some(o => o.includes('no'));
    if (isYesNoQuestion) {
      console.log('JobRight AI: Skipping AI for Yes/No question (should use matchYesNoQuestion):', field.label.substring(0, 50));
      return null;
    }
  }
  
  try {
    console.log('JobRight AI: Trying AI match for:', field.label);
    
    const result = await sendMessage({
      type: 'aiMatch',
      question: field.label,
      inputType: field.type,
      options: field.options || []
    });
    
    if (result && !result.error && result.answer && result.confidence > 0.5) {
      // Extra safety: reject AI responses that look like generic advice
      const answer = result.answer;
      if (answer.length > 200 || 
          answer.includes('best practices') || 
          answer.includes('I follow') ||
          answer.includes('I confirm') ||
          answer.includes('security') && field.type === 'password') {
        console.log('JobRight AI: Rejecting verbose/generic AI response');
        return null;
      }
      
      console.log('JobRight AI: AI matched:', result.answer, 'confidence:', result.confidence);
      return {
        field,
        value: result.answer,
        confidence: result.confidence,
        source: `Claude · ${result.field_key}`,
      };
    }
  } catch (error) {
    console.error('JobRight AI: AI match error:', error);
  }
  
  return null;
}

// Check if a label looks like an open-ended essay question
function isOpenEndedQuestionLabel(label: string): boolean {
  const lowerLabel = label.toLowerCase();
  
  // Direct matches for common open-ended starters
  const openEndedStarters = [
    'why do you want',
    'why are you interested',
    'what do you hope',
    'what would you',
    'what motivates you',
    'tell us about',
    'tell me about',
    'describe your',
    'describe a time',
    'explain why',
    'explain how',
    'how would you',
    'how do you',
    'what makes you',
    'what drives you',
    'what excites you',
  ];
  
  if (openEndedStarters.some(s => lowerLabel.includes(s))) {
    return true;
  }
  
  // Pattern matches
  const openEndedPatterns = [
    /^why\s+/i,  // Any question starting with "Why"
    /^what\s+.*\s+(hope|gain|learn|bring|contribute|expect)/i,
    /growth\s*equity/i,
    /private\s*equity/i,
    /investment\s*bank/i,
    /venture\s*capital/i,
    /\banalyst\s*role\b/i,
    /\bintern.*role\b/i,
    /\bsummer\s*(analyst|intern|associate)\b/i,
    /capital\s*partners/i,
    /\bpartners\s*\?/i,  // "Why [Company] Partners?"
    /why\s+\w+\s+(capital|partners|group|advisors|investments|consulting|associates)/i,
    /this\s+(position|opportunity|role)\b/i,
  ];
  
  return openEndedPatterns.some(p => p.test(label));
}

// Generate AI answer specifically for open-ended questions
async function generateAIAnswerForField(field: DetectedField): Promise<Suggestion | null> {
  try {
    console.log('JobRight AI: Generating AI answer for:', field.label.substring(0, 50));
    
    // For open-ended questions, always use a generous character limit
    // These are essay-style questions even if they use text inputs
    const maxLength = 1000; // Allow full, complete answers
    
    const response = await sendMessage({
      type: 'aiAnswerQuestion',
      question: field.label,
      maxLength: maxLength
    });
    
    if (response && response.answer && !response.error) {
      // Clean up the answer
      let answer = response.answer.trim();
      
      // Remove quotes if wrapped
      if (answer.startsWith('"') && answer.endsWith('"')) {
        answer = answer.slice(1, -1);
      }
      
      console.log('JobRight AI: AI generated answer:', answer.substring(0, 100) + '...');
      
      return {
        field,
        value: answer,
        confidence: 0.9,
        source: 'Claude'
      };
    }
  } catch (error) {
    console.error('JobRight AI: Error generating AI answer:', error);
  }
  
  return null;
}

function matchField(field: DetectedField): Suggestion | null {
  if (!currentProfile) return null;
  
  const label = field.label.toLowerCase();
  const name = field.name.toLowerCase();
  const combined = `${label} ${name}`;
  
  // SENSITIVE FIELDS - Never auto-fill
  if (isSensitiveField(combined)) {
    return null; // Don't even show in suggestions
  }
  
  // SPECIAL HANDLING FOR YES/NO RADIO QUESTIONS
  // If it's a radio with Yes/No options, we need to return Yes or No, not other values
  if (field.type === 'radio' && field.options) {
    const optionsLower = field.options.map(o => o.toLowerCase());
    const isYesNoQuestion = optionsLower.some(o => o.includes('yes')) && optionsLower.some(o => o.includes('no'));
    
    if (isYesNoQuestion) {
      const yesNoAnswer = matchYesNoQuestion(combined);
      if (yesNoAnswer !== null) {
        return {
          field,
          value: yesNoAnswer,
          confidence: 0.95,
          source: 'yes_no_match'
        };
      }
    }
  }
  
  // Parse name
  const nameParts = currentProfile.name?.split(' ') || [];
  const firstName = currentProfile.first_name || nameParts[0] || '';
  const lastName = currentProfile.last_name || nameParts.slice(1).join(' ') || '';
  
  // Field matching patterns
  const patterns: Array<{
    regex: RegExp[];
    value: string | (() => string);
    source: string;
    confidence: number;
  }> = [
    // Name fields
    { regex: [/first.?name/i, /given.?name/i, /^first$/i], value: firstName, source: 'first_name', confidence: 0.95 },
    { regex: [/last.?name/i, /family.?name/i, /surname/i, /^last$/i], value: lastName, source: 'last_name', confidence: 0.95 },
    { regex: [/full.?name/i, /^name$/i, /your.?name/i], value: currentProfile.name, source: 'name', confidence: 0.9 },
    
    // Contact
    { regex: [/email/i, /e-?mail/i], value: currentProfile.email, source: 'email', confidence: 0.98 },
    { regex: [/phone/i, /mobile/i, /cell/i, /tel/i], value: currentProfile.phone || '', source: 'phone', confidence: 0.9 },
    
    // Username (direct profile field - NEVER use AI)
    { regex: [/username/i, /user.?name/i, /login/i, /user.?id/i, /account.?name/i], value: () => getFieldValue('username') || currentProfile.email, source: 'username', confidence: 0.95 },
    
    // Location
    { regex: [/location/i, /city/i, /address/i], value: currentProfile.location || '', source: 'location', confidence: 0.85 },
    { regex: [/^country$/i, /your.*country/i, /country.*residence/i], value: currentProfile.country || currentProfile.fields?.country || '', source: 'country', confidence: 0.9 },
    
    // Citizenship / Nationality
    { regex: [/citizenship/i, /nationality/i, /citizen.*of/i, /country.*citizenship/i, /territory.*citizenship/i, /market.*citizenship/i], value: () => getFieldValue('citizenship') || currentProfile.country || '', source: 'citizenship', confidence: 0.9 },
    
    // Work authorization - KEY QUESTIONS
    { regex: [/authorized.*work/i, /legally.*authorized/i, /eligible.*work/i, /right.*work/i, /permission.*work/i], value: () => getFieldValue('work_authorized') || 'Yes', source: 'work_authorized', confidence: 0.95 },
    { regex: [/visa/i, /sponsorship/i, /work.?permit/i, /require.*sponsor/i, /immigration/i], value: () => getFieldValue('sponsorship') || 'No', source: 'sponsorship', confidence: 0.95 },
    { regex: [/in.?office/i, /on.?site/i, /onsite/i, /hybrid/i, /days.*week/i, /office.*days/i], value: () => getFieldValue('in_office') || 'Yes', source: 'in_office', confidence: 0.9 },
    { regex: [/remote/i, /work.*home/i, /wfh/i, /telecommute/i], value: () => getFieldValue('remote_preference') || 'Yes', source: 'remote_preference', confidence: 0.85 },
    { regex: [/relocate/i, /relocation/i, /willing.*move/i, /open.*relocat/i], value: () => getFieldValue('relocate') || 'Yes', source: 'relocate', confidence: 0.85 },
    { regex: [/travel/i, /traveling/i, /percentage.*travel/i, /willing.*travel/i], value: () => getFieldValue('travel') || 'Yes', source: 'travel', confidence: 0.85 },
    
    // Legal verification
    { regex: [/18.?years/i, /at.?least.?18/i, /over.?18/i, /legal.?age/i, /minimum.?age/i], value: () => getFieldValue('over_18') || 'Yes', source: 'over_18', confidence: 0.98 },
    { regex: [/background.?check/i, /consent.*background/i, /criminal.*check/i], value: () => getFieldValue('background_check') || 'Yes', source: 'background_check', confidence: 0.95 },
    { regex: [/drug.?test/i, /drug.?screen/i, /substance.*test/i], value: () => getFieldValue('drug_test') || 'Yes', source: 'drug_test', confidence: 0.95 },
    { regex: [/non.?compete/i, /non-compete/i, /compete.*agreement/i, /restrictive.*covenant/i], value: () => getFieldValue('non_compete') || 'No', source: 'non_compete', confidence: 0.9 },
    
    // Education
    { regex: [/enrolled/i, /currently.*student/i, /still.*studying/i, /currently.*enrolled/i], value: () => getFieldValue('enrolled') || 'No', source: 'enrolled', confidence: 0.9 },
    { regex: [/graduation/i, /graduate.*date/i, /completion.*date/i, /when.*graduate/i, /anticipated.*graduation/i], value: () => getFieldValue('graduation_date') || '', source: 'graduation_date', confidence: 0.9 },
    { regex: [/education.*level/i, /highest.*education/i, /degree.*level/i, /qualification/i], value: () => getFieldValue('education_level') || '', source: 'education_level', confidence: 0.85 },
    { regex: [/university/i, /college/i, /school.*name/i, /institution/i], value: () => getFieldValue('university') || '', source: 'university', confidence: 0.85 },
    { regex: [/major/i, /field.*study/i, /specialization/i, /concentration/i], value: () => getFieldValue('major') || '', source: 'major', confidence: 0.85 },
    { regex: [/gpa/i, /grade.*point/i, /cgpa/i], value: () => getFieldValue('gpa') || '', source: 'gpa', confidence: 0.85 },
    
    // Demographics (EEO)
    { regex: [/ethnicity/i, /race/i, /ethnic.*background/i], value: () => getFieldValue('ethnicity') || '', source: 'ethnicity', confidence: 0.8 },
    { regex: [/gender/i, /sex/i], value: () => getFieldValue('gender') || '', source: 'gender', confidence: 0.8 },
    { regex: [/hispanic/i, /latino/i, /latina/i], value: () => getFieldValue('hispanic') || '', source: 'hispanic', confidence: 0.8 },
    { regex: [/veteran/i, /military/i, /armed.*forces/i, /protected.*veteran/i], value: () => getFieldValue('veteran_status') || '', source: 'veteran_status', confidence: 0.8 },
    { regex: [/disability/i, /disabled/i, /handicap/i], value: () => getFieldValue('disability') || '', source: 'disability', confidence: 0.8 },
    
    // Referral
    { regex: [/hear.?about/i, /how.?did.?you/i, /learn.*about/i, /source/i, /referral/i, /found.*us/i], value: () => getFieldValue('referral_source') || 'Online Search', source: 'referral_source', confidence: 0.75 },
    { regex: [/referred.*by/i, /referrer/i, /who.*referred/i, /employee.*referral/i], value: () => getFieldValue('referrer_name') || '', source: 'referrer_name', confidence: 0.75 },
    
    // Experience & Compensation
    { regex: [/years.*experience/i, /experience.*years/i, /total.*experience/i], value: () => getFieldValue('years_experience') || '', source: 'years_experience', confidence: 0.85 },
    { regex: [/current.*salary/i, /present.*salary/i, /current.*compensation/i], value: () => getFieldValue('current_salary') || '', source: 'current_salary', confidence: 0.8 },
    { regex: [/expected.*salary/i, /desired.*salary/i, /salary.*expectation/i, /salary.*requirement/i, /compensation.*expectation/i], value: () => getFieldValue('expected_salary') || '', source: 'expected_salary', confidence: 0.8 },
    { regex: [/start.*date/i, /available.*start/i, /when.*start/i, /earliest.*start/i, /notice.*period/i], value: () => getFieldValue('start_date') || 'Immediately', source: 'start_date', confidence: 0.85 },
    { regex: [/employment.*type/i, /full.?time/i, /part.?time/i, /job.*type/i], value: () => getFieldValue('employment_type') || 'Full-time', source: 'employment_type', confidence: 0.85 },
    
    // Links & Profiles
    { regex: [/linkedin/i, /linked.?in/i], value: () => getFieldValue('linkedin_url') || '', source: 'linkedin_url', confidence: 0.9 },
    { regex: [/portfolio/i, /website/i, /personal.*site/i], value: () => getFieldValue('portfolio_url') || '', source: 'portfolio_url', confidence: 0.9 },
    { regex: [/github/i, /git.?hub/i], value: () => getFieldValue('github_url') || '', source: 'github_url', confidence: 0.9 },
    
    // Job title
    { regex: [/current.*title/i, /job.*title/i, /position.*title/i], value: () => getFieldValue('current_title') || '', source: 'current_title', confidence: 0.85 },
    
    // Answer Bank (Open-ended questions)
    { regex: [/why.*interest/i, /why.*apply/i, /why.*this.*role/i, /why.*position/i, /interest.*role/i, /attracted.*role/i], value: () => getAnswerValue('why_interested') || '', source: 'answers.why_interested', confidence: 0.85 },
    { regex: [/why.*company/i, /why.*us/i, /why.*work.*here/i, /why.*join/i, /why.*organization/i], value: () => getAnswerValue('why_company') || '', source: 'answers.why_company', confidence: 0.85 },
    { regex: [/tell.*about.*yourself/i, /describe.*yourself/i, /introduce.*yourself/i, /about.*you/i], value: () => getAnswerValue('about_yourself') || '', source: 'answers.about_yourself', confidence: 0.85 },
    { regex: [/strength/i, /greatest.*strength/i, /top.*strength/i, /best.*qualit/i], value: () => getAnswerValue('strengths') || '', source: 'answers.strengths', confidence: 0.85 },
    { regex: [/weakness/i, /area.*improve/i, /development.*area/i, /growth.*area/i], value: () => getAnswerValue('weaknesses') || '', source: 'answers.weaknesses', confidence: 0.85 },
    { regex: [/lead.*team/i, /leadership/i, /manage.*team/i, /led.*project/i, /management.*experience/i], value: () => getAnswerValue('leadership') || '', source: 'answers.leadership', confidence: 0.85 },
    { regex: [/challenge/i, /difficult.*situation/i, /obstacle/i, /problem.*solv/i, /overcome/i], value: () => getAnswerValue('challenge') || '', source: 'answers.challenge', confidence: 0.85 },
    { regex: [/achievement/i, /accomplishment/i, /proud.*of/i, /success.*story/i, /greatest.*achiev/i], value: () => getAnswerValue('achievement') || '', source: 'answers.achievement', confidence: 0.85 },
    { regex: [/5.*years/i, /future/i, /career.*goal/i, /where.*see.*yourself/i, /long.*term/i], value: () => getAnswerValue('future_goals') || '', source: 'answers.future_goals', confidence: 0.85 },
    { regex: [/additional.*info/i, /anything.*else/i, /like.*add/i, /want.*know/i, /other.*info/i], value: () => getAnswerValue('additional') || '', source: 'answers.additional', confidence: 0.75 },
  ];
  
  // Try pattern matching. Test label and name individually too — anchored
  // patterns like /^country$/ can never match the concatenated string.
  for (const pattern of patterns) {
    for (const regex of pattern.regex) {
      if (regex.test(combined) || regex.test(label) || regex.test(name)) {
        const value = typeof pattern.value === 'function' ? pattern.value() : pattern.value;
        if (value) {
          return {
            field,
            value,
            confidence: pattern.confidence,
            source: pattern.source
          };
        }
      }
    }
  }
  
  // Check custom fields
  for (const [key, value] of Object.entries(currentProfile.fields || {})) {
    const keyLower = key.toLowerCase().replace(/[_-]/g, ' ');
    if (combined.includes(keyLower) || keyLower.split(' ').some(w => w.length > 3 && combined.includes(w))) {
      return {
        field,
        value,
        confidence: 0.75,
        source: `fields.${key}`
      };
    }
  }
  
  return null;
}

function getFieldValue(key: string): string {
  if (!currentProfile) return '';
  return currentProfile.fields?.[key] || '';
}

function getAnswerValue(key: string): string {
  if (!currentProfile) return '';
  return currentProfile.answers?.[key] || '';
}

// Special matching for Yes/No questions
function matchYesNoQuestion(questionText: string): string | null {
  const q = questionText.toLowerCase();
  
  // Define Yes/No question patterns and their expected answers based on profile
  const yesNoPatterns: Array<{
    patterns: RegExp[];
    answerKey: string;
    defaultYes: boolean; // What to answer if profile field is empty
    invertAnswer?: boolean; // If true, "Yes" in profile means answer "No"
  }> = [
    // Work authorization - "Are you authorized to work?" → Yes
    { 
      patterns: [/authorized.*work/i, /legally.*work/i, /eligible.*work/i, /permitted.*work/i, /right.*work/i, /able.*work/i],
      answerKey: 'work_authorized',
      defaultYes: true
    },
    // Visa sponsorship - "Will you require sponsorship?" → Usually No (from profile)
    {
      patterns: [/require.*sponsor/i, /need.*sponsor/i, /visa.*sponsor/i, /sponsorship/i, /OPT/i, /F-1/i, /work.*visa/i, /employment.*visa/i],
      answerKey: 'sponsorship',
      defaultYes: false
    },
    // Age verification - "Are you 18+?" → Yes
    {
      patterns: [/18.*years/i, /at.*least.*18/i, /over.*18/i, /legal.*age/i, /minimum.*age/i],
      answerKey: 'over_18',
      defaultYes: true
    },
    // Currently enrolled - "Are you enrolled in university?" → From profile
    {
      patterns: [/enrolled/i, /currently.*student/i, /university.*program/i, /studying/i],
      answerKey: 'enrolled',
      defaultYes: false
    },
    // In-office work - "Can you work in office?" → Yes
    {
      patterns: [/in.*office/i, /on.?site/i, /office.*days/i, /days.*week/i, /hybrid/i],
      answerKey: 'in_office',
      defaultYes: true
    },
    // Remote work - "Do you prefer remote?" → From profile
    {
      patterns: [/remote.*work/i, /work.*home/i, /wfh/i],
      answerKey: 'remote_preference',
      defaultYes: true
    },
    // Relocation - "Willing to relocate?" → Yes
    {
      patterns: [/willing.*relocate/i, /relocat/i, /move.*location/i],
      answerKey: 'relocate',
      defaultYes: true
    },
    // Travel - "Willing to travel?" → Yes
    {
      patterns: [/willing.*travel/i, /travel.*required/i, /travel.*percent/i],
      answerKey: 'travel',
      defaultYes: true
    },
    // Background check consent - "Agree to background check?" → Yes
    {
      patterns: [/background.*check/i, /criminal.*check/i],
      answerKey: 'background_check',
      defaultYes: true
    },
    // Drug test consent - "Agree to drug test?" → Yes
    {
      patterns: [/drug.*test/i, /drug.*screen/i],
      answerKey: 'drug_test',
      defaultYes: true
    },
    // Meet criteria/eligible/qualified - Generic eligibility questions → Yes
    {
      patterns: [/meet.*criteria/i, /meet.*requirement/i, /meet.*eligib/i, /eligible/i, /qualified/i, /meet.*minimum/i],
      answerKey: 'eligible',
      defaultYes: true
    },
    // Full time availability - "Can you work full time?" → Yes
    {
      patterns: [/full.*time/i, /available.*work/i, /work.*duration/i, /able.*work.*full/i],
      answerKey: 'full_time',
      defaultYes: true
    },
    // Non-compete - "Are you under non-compete?" → No
    {
      patterns: [/non.?compete/i, /compete.*agreement/i],
      answerKey: 'non_compete',
      defaultYes: false
    },
    // Dual/Multiple nationality - "Do you have dual nationality?" → Usually No
    {
      patterns: [/dual.*nation/i, /tri.*nation/i, /multiple.*nation/i, /dual.*citizen/i, /second.*citizen/i],
      answerKey: 'dual_nationality',
      defaultYes: false
    },
    // Previous employment - "Have you worked for [Company] before?" → Usually No
    {
      patterns: [/previously.*employed/i, /currently.*employed/i, /worked.*before/i, /former.*employee/i, /ever.*worked/i, /employed.*by/i],
      answerKey: 'previously_employed',
      defaultYes: false
    },
    // Disability - "Do you have a disability?" → From profile or decline
    {
      patterns: [/have.*disability/i, /disability.*status/i],
      answerKey: 'has_disability',
      defaultYes: false
    },
    // Veteran - "Are you a veteran?" → From profile or no
    {
      patterns: [/are.*veteran/i, /military.*service/i, /served.*military/i],
      answerKey: 'is_veteran',
      defaultYes: false
    },
    // Criminal record - "Do you have criminal record?" → No
    {
      patterns: [/criminal.*record/i, /convicted/i, /felony/i, /misdemeanor/i],
      answerKey: 'criminal_record',
      defaultYes: false
    },
    // Fluent in English - "Are you fluent in English?" → Yes
    {
      patterns: [/fluent.*english/i, /english.*fluent/i, /speak.*english/i, /proficient.*english/i],
      answerKey: 'fluent_english',
      defaultYes: true
    },
    // Completed studies - "Will you have completed studies by X?" → Yes
    {
      patterns: [/completed.*studies/i, /complete.*degree/i, /graduate.*by/i, /finish.*studies/i],
      answerKey: 'completed_studies',
      defaultYes: true
    },
  ];
  
  for (const pattern of yesNoPatterns) {
    for (const regex of pattern.patterns) {
      if (regex.test(q)) {
        // Get value from profile
        const profileValue = getFieldValue(pattern.answerKey);
        
        let answer: boolean;
        if (profileValue) {
          // Profile has a value
          const isYes = profileValue.toLowerCase() === 'yes' || 
                        profileValue.toLowerCase() === 'true' || 
                        profileValue === '1';
          answer = pattern.invertAnswer ? !isYes : isYes;
        } else {
          // Use default
          answer = pattern.defaultYes;
        }
        
        console.log('JobRight AI: Yes/No match:', pattern.answerKey, '→', answer ? 'Yes' : 'No');
        return answer ? 'Yes' : 'No';
      }
    }
  }
  
  return null;
}

function isSensitiveField(text: string): boolean {
  const sensitivePatterns = [
    /password/i,
    /^pwd$/i,
    /confirm.*password/i,
    /re.?enter.*password/i,
    /ssn/i,
    /social.?security/i,
    /bank.?account/i,
    /credit.?card/i,
    /card.?number/i,
    /cvv/i,
    /pin/i,
    /secret/i,
    /security.?code/i,
    /security.?question/i,
    /mother.*maiden/i,
    /terms.*use/i,
    /privacy.*policy/i,
    /agree/i,
    /consent/i,
    /i.?accept/i,
  ];
  
  return sensitivePatterns.some(p => p.test(text));
}

// Fields that should use profile value directly, NOT AI
function isDirectProfileField(text: string): boolean {
  const directPatterns = [
    /username/i,
    /user.?name/i,
    /login/i,
    /user.?id/i,
    /account.?name/i,
  ];
  
  return directPatterns.some(p => p.test(text));
}

// ===== QuickApply design system (dark, lime accent) — see DESIGN_BRIEF.md =====
const QA_SVG = {
  minus: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M3.5 8h9"></path></svg>',
  close: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"></path></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#c9f24d" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 4.5L6.2 11.8 2.8 8.4"></path></svg>',
  checkSmall: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#c9f24d" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 4.5L6.2 11.8 2.8 8.4"></path></svg>',
  sparkle: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#a78bfa" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2l1.6 4.4L14 8l-4.4 1.6L8 14l-1.6-4.4L2 8l4.4-1.6z"></path></svg>',
  search: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#8a8a86" stroke-width="1.6" stroke-linecap="round"><circle cx="9" cy="9" r="6"></circle><path d="M13.5 13.5L17 17"></path></svg>',
};

const QA_CSS = `
#jobright-overlay { position:fixed; top:20px; right:20px; width:400px; z-index:2147483647; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
#jobright-overlay * { box-sizing:border-box; margin:0; }
@keyframes qaRise { from { opacity:0; transform:translateY(8px) scale(.99) } to { opacity:1; transform:none } }
@keyframes qaPop { from { opacity:0; transform:translateY(10px) scale(.94) } to { opacity:1; transform:none } }
.qa-panel { display:flex; flex-direction:column; max-height:85vh; background:#131312; border:1px solid #2e2e2b; border-radius:16px; box-shadow:0 28px 60px -20px rgba(0,0,0,.75); overflow:hidden; animation:qaRise .2s ease-out; }
.qa-pill { display:none; position:fixed; bottom:22px; right:22px; align-items:center; gap:10px; background:#131312; border:1px solid #2e2e2b; border-radius:999px; padding:9px 15px 9px 11px; cursor:pointer; font-family:inherit; box-shadow:0 18px 40px -14px rgba(0,0,0,.7); animation:qaPop .22s cubic-bezier(.2,.9,.3,1.2); }
.qa-pill:hover { border-color:#43433f; }
#jobright-overlay.jr-min .qa-panel { display:none; }
#jobright-overlay.jr-min .qa-pill { display:flex; }
.qa-logo { width:24px; height:24px; border-radius:8px; background:#c9f24d; color:#0b1004; font-size:13px; font-weight:700; display:flex; align-items:center; justify-content:center; flex:none; }
.qa-header { display:flex; align-items:center; gap:10px; padding:12px 12px 12px 14px; border-bottom:1px solid #242423; }
.qa-title { font-size:14.5px; font-weight:600; color:#f4f4f2; letter-spacing:-.01em; flex:1; }
.qa-iconbtn { width:28px; height:28px; display:flex; align-items:center; justify-content:center; border:none; background:transparent; border-radius:8px; cursor:pointer; color:#9d9d98; padding:0; }
.qa-iconbtn:hover { background:#212120; color:#f4f4f2; }
.qa-profile { display:flex; align-items:center; gap:8px; padding:9px 14px; background:#171716; border-bottom:1px solid #242423; }
.qa-dim { font-size:12px; color:#8a8a86; }
.qa-profile-name { font-size:12px; font-weight:600; color:#e6e6e1; }
.qa-spacer { flex:1; }
.qa-link { font-size:12px; color:#c9f24d; font-weight:600; cursor:pointer; }
.qa-status { padding:12px 14px; display:flex; align-items:center; gap:9px; border-bottom:1px solid #242423; }
.qa-status.post { flex-direction:column; align-items:stretch; gap:8px; background:rgba(201,242,77,.06); }
.qa-status-row { display:flex; align-items:center; gap:9px; }
.qa-status-dot { width:7px; height:7px; border-radius:999px; background:#c9f24d; flex:none; box-shadow:0 0 0 4px rgba(201,242,77,.16); }
.qa-status-strong { font-size:13px; font-weight:600; color:#f4f4f2; }
.qa-amber { color:#f0b429; font-weight:600; font-size:13px; }
.qa-dim12 { font-size:12px; color:#8a8a86; }
.qa-bar { height:5px; border-radius:999px; background:#242423; overflow:hidden; display:flex; }
.qa-bar .ok { background:#c9f24d; }
.qa-bar .warn { background:#f0b429; }
.qa-tabs { display:flex; gap:6px; padding:10px 12px 2px; }
.qa-tab { font-family:inherit; font-size:12.5px; font-weight:600; color:#9d9d98; background:transparent; border:1px solid #2e2e2b; border-radius:999px; padding:7px 14px; cursor:pointer; }
.qa-tab:hover { color:#f4f4f2; border-color:#43433f; }
.qa-tab.active { color:#0b1004; background:#c9f24d; border-color:#c9f24d; }
.qa-body { flex:1; overflow:auto; padding:10px 12px 14px; display:flex; flex-direction:column; gap:8px; min-height:210px; }
.qa-tab-content { display:none; flex-direction:column; gap:8px; }
.qa-tab-content.active { display:flex; }
.qa-card { border:1px solid #2a2a28; border-radius:13px; padding:12px 13px; display:flex; flex-direction:column; gap:9px; background:#181817; cursor:pointer; transition:border-color .14s; }
.qa-card:hover { border-color:#43433f; }
.qa-card.filled { border-color:rgba(201,242,77,.3); background:rgba(201,242,77,.07); }
.qa-card.failed { border-color:rgba(240,180,41,.32); background:rgba(240,180,41,.07); }
.qa-card-top { display:flex; align-items:flex-start; gap:8px; }
.qa-q { flex:1; font-size:13px; line-height:1.4; font-weight:500; color:#eaeae5; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.qa-badge { font-size:10.5px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:#9d9d98; background:#242423; border-radius:6px; padding:3px 7px; flex:none; }
.qa-badge.custom, .qa-card.failed .qa-badge { color:#f0b429; background:rgba(240,180,41,.14); }
.qa-card-check { display:none; flex:none; margin-top:1px; }
.qa-card.filled .qa-badge { display:none; }
.qa-card.filled .qa-card-check { display:block; }
.qa-answer { font-size:13px; line-height:1.5; color:#c4c4bf; background:#1f1f1d; border:1px solid #2a2a28; border-radius:9px; padding:8px 10px; outline:none; }
.qa-answer:focus { border:1.5px solid #c9f24d; background:#131312; color:#f4f4f2; }
.qa-card.filled .qa-answer, .qa-card.failed .qa-answer { background:transparent; border-color:transparent; padding:0; }
.qa-card.failed .qa-answer { font-size:12.5px; color:#d8c79b; }
.qa-card-meta { display:flex; align-items:center; gap:8px; }
.qa-dot { width:6px; height:6px; border-radius:999px; flex:none; background:#c9f24d; }
.qa-dot.med { background:#b3d94a; opacity:.7; }
.qa-dot.low { background:#f0b429; }
.qa-card.failed .qa-dot { background:#f0b429; opacity:1; }
.qa-card.filled .qa-dot { background:#c9f24d; opacity:1; }
.qa-conf { font-size:11.5px; font-weight:600; color:#9d9d98; }
.qa-card.filled .qa-conf { color:#c9f24d; }
.qa-card.failed .qa-conf { color:#f0b429; }
.qa-metadim { font-size:11.5px; color:#8a8a86; }
.qa-action { font-size:11.5px; font-weight:600; color:#7c7c78; cursor:pointer; }
.qa-card.filled .qa-action { color:#9d9d98; }
.qa-card.failed .qa-action { color:#e6e6e1; }
.qa-missing-note { font-size:12px; line-height:1.55; color:#8a8a86; padding:0 2px 2px; }
.qa-key { font-size:11px; font-family:ui-monospace,Menlo,monospace; color:#c9f24d; background:rgba(201,242,77,.1); border-radius:6px; padding:4px 7px; }
.qa-key.ai { color:#a78bfa; background:#241d3a; }
.qa-add { font-size:12px; font-weight:600; color:#c9f24d; cursor:pointer; }
.qa-add.ai { color:#a78bfa; }
.qa-footer { border-top:1px solid #242423; padding:12px; display:flex; flex-direction:column; gap:10px; background:#131312; }
.qa-actions { display:flex; gap:8px; }
.qa-btn-primary { font-family:inherit; flex:1; font-size:13.5px; font-weight:700; color:#0b1004; background:#c9f24d; border:none; border-radius:999px; padding:12px; cursor:pointer; }
.qa-btn-primary:hover { background:#d8ff63; }
.qa-btn-ghost { font-family:inherit; font-size:13.5px; font-weight:600; color:#9d9d98; background:transparent; border:1px solid #2e2e2b; border-radius:999px; padding:12px 18px; cursor:pointer; }
.qa-btn-ghost:hover { color:#f4f4f2; border-color:#43433f; }
.qa-btn-secondary { font-family:inherit; font-size:13px; font-weight:600; color:#e6e6e1; background:#1e1e1c; border:1px solid #2e2e2b; border-radius:999px; padding:10px; cursor:pointer; }
.qa-btn-secondary:hover { background:#262624; }
.qa-ai { display:flex; align-items:center; gap:10px; padding:10px 11px; border:1px solid #2b2540; background:#1a172a; border-radius:12px; }
.qa-ai-icon { width:22px; height:22px; border-radius:7px; background:#241d3a; display:flex; align-items:center; justify-content:center; flex:none; }
.qa-ai-text { flex:1; display:flex; flex-direction:column; gap:1px; }
.qa-ai-title { font-size:12.5px; font-weight:600; color:#e9e6f7; }
.qa-ai-sub { font-size:11.5px; color:#9a92b8; }
.qa-ai-btn { font-family:inherit; font-size:12px; font-weight:600; color:#e9e6f7; background:#2b2540; border:none; border-radius:999px; padding:7px 12px; cursor:pointer; }
.qa-ai-btn:hover { background:#372f52; }
.qa-pill-name { font-size:13px; font-weight:600; color:#f4f4f2; }
.qa-pill-count { font-size:12px; font-weight:700; color:#0b1004; background:#c9f24d; border-radius:999px; padding:2px 8px; }
.qa-pill-logo { width:22px; height:22px; border-radius:7px; background:#c9f24d; color:#0b1004; font-size:12px; font-weight:700; display:flex; align-items:center; justify-content:center; }
.qa-empty { display:flex; flex-direction:column; align-items:center; gap:10px; text-align:center; padding:26px 20px; background:#131312; border:1px solid #2e2e2b; border-radius:16px; box-shadow:0 28px 60px -20px rgba(0,0,0,.75); animation:qaRise .2s ease-out; }
.qa-empty-icon { width:38px; height:38px; border-radius:12px; background:#1f1f1d; border:1px solid #2e2e2b; display:flex; align-items:center; justify-content:center; }
.qa-empty-title { font-size:13.5px; font-weight:600; color:#f4f4f2; }
.qa-empty-sub { font-size:12.5px; line-height:1.55; color:#8a8a86; max-width:30ch; }
`;

function qaConf(confidence: number): { label: string; cls: string } {
  if (confidence >= 0.9) return { label: 'High', cls: '' };
  if (confidence >= 0.75) return { label: 'Medium', cls: 'med' };
  return { label: 'Low — check me', cls: 'low' };
}

function buildCardHtml(s: Suggestion, i: number): string {
  const conf = qaConf(s.confidence);
  const answerHtml = s.mask
    ? `<div class="qa-answer">••••••••••</div>`
    : `<div class="qa-answer" contenteditable="true" data-original="${escapeHtml(s.value)}">${escapeHtml(s.value)}</div>`;
  return `
    <div class="qa-card" data-index="${i}">
      <div class="qa-card-top">
        <div class="qa-q" title="${escapeHtml(s.field.label)}">${escapeHtml(truncate(s.field.label, 110))}</div>
        <span class="qa-badge${s.field.isCustom ? ' custom' : ''}">${s.field.isCustom ? 'custom' : escapeHtml(s.field.type)}</span>
        <span class="qa-card-check">${QA_SVG.check}</span>
      </div>
      ${answerHtml}
      <div class="qa-card-meta">
        <span class="qa-dot ${conf.cls}"></span>
        <span class="qa-conf">${conf.label}</span>
        <span class="qa-metadim">· ${escapeHtml(s.source)}</span>
        <span class="qa-spacer"></span>
        <span class="qa-action">Click to fill</span>
      </div>
    </div>`;
}

function showOverlay() {
  const existing = document.getElementById('jobright-overlay');
  if (existing) existing.remove();

  const fillable = suggestions.filter(s => !s.skipAutoFill && s.value);

  if (fillable.length === 0 && missingFields.length === 0 && pendingAIFields.length === 0) {
    showEmptyState();
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'jobright-overlay';

  const cardsHtml = (fillable.length === 0 && pendingAIFields.length === 0 ? `
    <div class="qa-missing-note">No matches yet — the Missing tab shows what to add to your profile.</div>
  ` : fillable.map((s, i) => buildCardHtml(s, i)).join('')) +
  pendingAIFields.map((f, pi) => `
    <div class="qa-card" data-pending-id="${pi}" style="cursor:default">
      <div class="qa-card-top">
        <div class="qa-q" title="${escapeHtml(f.label)}">${escapeHtml(truncate(f.label, 110))}</div>
        <span class="qa-badge">${escapeHtml(f.type)}</span>
      </div>
      <div class="qa-card-meta">
        <span class="qa-ai-icon">${QA_SVG.sparkle}</span>
        <span style="font-size:11.5px;font-weight:600;color:#a78bfa">Claude is writing…</span>
      </div>
    </div>`).join('');

  const missingHtml = missingFields.length === 0 ? `
    <div class="qa-missing-note">Nothing missing — your profile covers every question on this page.</div>
  ` : `
    <div class="qa-missing-note">${missingFields.length === 1 ? 'One question' : missingFields.length + ' questions'} your profile can't answer yet. Add them once — filled forever after.</div>
    ${missingFields.map(m => {
      const ai = m.suggestedKey.startsWith('answers');
      return `
      <div class="qa-card" style="cursor:default">
        <div class="qa-q" title="${escapeHtml(m.label)}">${escapeHtml(truncate(m.label, 110))}</div>
        <div class="qa-card-meta">
          <span class="qa-key${ai ? ' ai' : ''}">${escapeHtml(m.suggestedKey)}</span>
          <span class="qa-spacer"></span>
          <span class="qa-add${ai && aiEnabled ? ' ai' : ''}">${ai && aiEnabled ? 'Ask Claude' : 'Add now'}</span>
        </div>
      </div>`;
    }).join('')}
    <button class="qa-btn-secondary" id="jr-open-profile" style="margin-top:2px">Open profile</button>
  `;

  const aiStrip = aiEnabled && missingFields.length > 0 ? `
    <div class="qa-ai">
      <span class="qa-ai-icon">${QA_SVG.sparkle}</span>
      <div class="qa-ai-text">
        <span class="qa-ai-title">Claude can answer the ${missingFields.length} open question${missingFields.length === 1 ? '' : 's'}</span>
        <span class="qa-ai-sub">Runs on your desktop — no API key</span>
      </div>
      <button class="qa-ai-btn" id="jr-ai-help">Ask</button>
    </div>` : '';

  overlay.innerHTML = `
    <style>${QA_CSS}</style>
    <div class="qa-panel">
      <div class="qa-header">
        <span class="qa-logo">Q</span>
        <span class="qa-title">QuickApply</span>
        <button class="qa-iconbtn" id="jr-minimize" title="Minimize">${QA_SVG.minus}</button>
        <button class="qa-iconbtn" id="jr-close" title="Close">${QA_SVG.close}</button>
      </div>
      <div class="qa-profile">
        <span class="qa-dim">Profile</span>
        <span class="qa-profile-name">${escapeHtml(currentProfile?.name || 'No profile')}</span>
        <span class="qa-spacer"></span>
        <span class="qa-link" id="jr-switch">Switch</span>
      </div>
      <div class="qa-status" id="jr-status">
        <span class="qa-status-dot"></span>
        <span class="qa-status-strong" id="jr-ready-count">${fillable.length} answer${fillable.length === 1 ? '' : 's'} ready</span>
        <span class="qa-dim12" id="jr-status-note">${pendingAIFields.length > 0 ? `· Claude is writing ${pendingAIFields.length} more…` : usingSavedAccountFor ? `· using your saved ${escapeHtml(usingSavedAccountFor)} login` : '· nothing is submitted for you'}</span>
      </div>
      <div class="qa-tabs">
        <button class="qa-tab active" data-tab="suggestions">Suggestions</button>
        <button class="qa-tab" data-tab="missing">Missing (${missingFields.length})</button>
      </div>
      <div class="qa-body">
        <div class="qa-tab-content active" id="jr-tab-suggestions">${cardsHtml}</div>
        <div class="qa-tab-content" id="jr-tab-missing">${missingHtml}</div>
      </div>
      <div class="qa-footer">
        <div class="qa-actions">
          ${fillable.length > 0 || pendingAIFields.length > 0
            ? `<button class="qa-btn-primary" id="jr-fill-all">Fill all (${fillable.length})</button>`
            : `<button class="qa-btn-secondary" id="jr-open-profile-main" style="flex:1">Add profile fields</button>`}
          <button class="qa-btn-ghost" id="jr-dismiss">Close</button>
        </div>
        ${aiStrip}
      </div>
    </div>
    <button class="qa-pill" id="jr-pill" title="Expand QuickApply">
      <span class="qa-pill-logo">Q</span>
      <span class="qa-pill-name">QuickApply</span>
      <span class="qa-pill-count">${fillable.length}</span>
    </button>
  `;

  document.body.appendChild(overlay);

  document.getElementById('jr-close')?.addEventListener('click', () => overlay.remove());
  document.getElementById('jr-dismiss')?.addEventListener('click', () => overlay.remove());
  document.getElementById('jr-minimize')?.addEventListener('click', () => overlay.classList.add('jr-min'));
  document.getElementById('jr-pill')?.addEventListener('click', () => overlay.classList.remove('jr-min'));
  document.getElementById('jr-fill-all')?.addEventListener('click', fillAllFields);
  document.getElementById('jr-ai-help')?.addEventListener('click', showAIAssistant);
  const openOptions = () => chrome.runtime.sendMessage({ type: 'openOptions' });
  document.getElementById('jr-open-profile')?.addEventListener('click', openOptions);
  document.getElementById('jr-open-profile-main')?.addEventListener('click', openOptions);
  document.getElementById('jr-switch')?.addEventListener('click', openOptions);

  overlay.querySelectorAll('.qa-add').forEach(el => {
    el.addEventListener('click', () => {
      if (el.classList.contains('ai')) showAIAssistant();
      else openOptions();
    });
  });

  // Tab switching
  overlay.querySelectorAll('.qa-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      overlay.querySelectorAll('.qa-tab').forEach(t => t.classList.remove('active'));
      overlay.querySelectorAll('.qa-tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`jr-tab-${tab.getAttribute('data-tab')}`)?.classList.add('active');
    });
  });

  // Delegated card interactions — also covers cards Claude adds later
  document.getElementById('jr-tab-suggestions')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const el = target.closest('.qa-card[data-index]') as HTMLElement | null;
    if (!el) return;
    if (target.classList.contains('qa-answer')) return; // user is editing

    const index = parseInt(el.getAttribute('data-index') || '0');
    const fillableNow = suggestions.filter(s => !s.skipAutoFill && s.value);
    const suggestion = fillableNow[index];
    if (!suggestion) return;

    if (target.classList.contains('qa-action')) {
      if (el.classList.contains('failed')) {
        suggestion.field.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        highlightField(suggestion.field.element);
        return;
      }
      if (el.classList.contains('filled')) {
        if (undoFill(suggestion)) updateCardState(el, suggestion, null);
        return;
      }
    }
    if (el.classList.contains('filled')) return;

    if (!suggestion.mask) {
      const valueEl = el.querySelector('.qa-answer') as HTMLElement;
      const editedValue = valueEl?.textContent?.trim() || '';
      const originalValue = valueEl?.getAttribute('data-original') || '';
      if (editedValue && editedValue !== originalValue) {
        suggestion.value = editedValue;
        learnFromCorrection(suggestion.field.label, suggestion.field.name, editedValue);
      }
    }

    const ok = fillField(suggestion);
    if (ok) registerAccountIfNeeded(suggestion);
    updateCardState(el, suggestion, ok);
  });

  // Answer the genuinely-new questions with Claude, in parallel, without blocking
  resolvePendingAI();
}

let hasFilledAll = false;

async function resolvePendingAI() {
  if (pendingAIFields.length === 0) return;
  let remaining = pendingAIFields.length;

  const updateStatus = () => {
    const fillableCount = suggestions.filter(s => !s.skipAutoFill && s.value).length;
    const ready = document.getElementById('jr-ready-count');
    if (ready) ready.textContent = `${fillableCount} answer${fillableCount === 1 ? '' : 's'} ready`;
    const note = document.getElementById('jr-status-note');
    if (note && !document.getElementById('jr-status')?.classList.contains('post')) {
      note.textContent = remaining > 0 ? `· Claude is writing ${remaining} more…` : '· nothing is submitted for you';
    }
    const btn = document.getElementById('jr-fill-all');
    if (btn) btn.textContent = `${hasFilledAll ? 'Fill again' : 'Fill all'} (${fillableCount})`;
    const missTab = document.querySelector('.qa-tab[data-tab="missing"]');
    if (missTab) missTab.textContent = `Missing (${missingFields.length})`;
  };

  await Promise.allSettled(pendingAIFields.map(async (field, pi) => {
    const isOpenEnded = isEssayField(field);
    let suggestion: Suggestion | null = null;
    try {
      suggestion = isOpenEnded ? await generateAIAnswerForField(field) : await tryAIMatch(field);
    } catch (e) {}
    remaining--;

    const card = document.querySelector(`.qa-card[data-pending-id="${pi}"]`) as HTMLElement | null;
    if (suggestion) {
      saveAnswerToCache(field.label, suggestion.value);
      suggestions.push(suggestion);
      const idx = suggestions.filter(s => !s.skipAutoFill && s.value).length - 1;
      if (card) card.outerHTML = buildCardHtml(suggestion, idx);
    } else {
      if (card) card.remove();
      const suggestedKey = detectMissingFieldKey(field.label, field.name) || `Custom: "${truncate(field.label, 30)}"`;
      missingFields.push({ label: field.label, suggestedKey });
      const missBody = document.getElementById('jr-tab-missing');
      if (missBody) {
        const div = document.createElement('div');
        div.className = 'qa-card';
        div.style.cursor = 'default';
        div.innerHTML = `<div class="qa-q">${escapeHtml(truncate(field.label, 110))}</div><div class="qa-card-meta"><span class="qa-key">${escapeHtml(suggestedKey)}</span></div>`;
        missBody.appendChild(div);
      }
    }
    updateStatus();
  }));
  updateStatus();
}

// Move a suggestion card between default / filled / failed states (design 02)
function updateCardState(item: HTMLElement, suggestion: Suggestion, ok: boolean | null) {
  item.classList.remove('filled', 'failed');
  const conf = item.querySelector('.qa-conf') as HTMLElement | null;
  const action = item.querySelector('.qa-action') as HTMLElement | null;
  if (ok === null) { // back to default after undo
    if (conf) conf.textContent = qaConf(suggestion.confidence).label;
    if (action) action.textContent = 'Click to fill';
    return;
  }
  item.classList.add(ok ? 'filled' : 'failed');
  if (conf) conf.textContent = ok ? 'Filled' : 'Fill manually';
  if (action) action.textContent = ok ? (suggestion.undoable ? 'Undo' : 'Filled') : 'Scroll to field';
}

function undoFill(suggestion: Suggestion): boolean {
  if (!suggestion.undoable) return false;
  const el = suggestion.field.element;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    setNativeValue(el, suggestion.prevValue || '');
    return true;
  }
  return false;
}

// "No form fields found" card (design 02, empty state)
function showEmptyState() {
  const existing = document.getElementById('jobright-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'jobright-overlay';
  overlay.innerHTML = `
    <style>${QA_CSS}</style>
    <div class="qa-empty">
      <span class="qa-empty-icon">${QA_SVG.search}</span>
      <div class="qa-empty-title">No form fields found here</div>
      <div class="qa-empty-sub">This looks like a job description, not an application. QuickApply will wake up on the apply page.</div>
      <button class="qa-btn-secondary" id="jr-save-job" style="margin-top:2px;padding:8px 14px;font-size:12.5px">Save job to tracker</button>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('jr-save-job')?.addEventListener('click', async () => {
    try {
      await sendMessage({
        type: 'saveApplication',
        application: {
          company: extractCompanyName(), position: extractJobTitle() || document.title,
          url: location.href, status: 'saved', source: 'manual',
          notes: 'Saved from job page', contacts: [], interviews: [], followUps: []
        }
      });
    } catch (e) {}
    showMessage('Saved to tracker', 'success');
    overlay.remove();
  });
}

// Learn from user corrections - save the mapping
async function learnFromCorrection(label: string, name: string, value: string) {
  try {
    const domain = window.location.hostname;
    const pattern = createLearnedPattern(label, name);
    
    await sendMessage({
      type: 'saveLearnedMapping',
      mapping: {
        domain,
        pattern,
        value,
        timestamp: Date.now()
      }
    });
    
    console.log('JobRight AI: Learned correction:', pattern, '->', value);
    showMessage('✓ Learned your preference for this question!', 'success');
  } catch (error) {
    console.error('JobRight AI: Failed to save learned mapping:', error);
  }
}

function createLearnedPattern(label: string, name: string): string {
  // Create a normalized pattern from the question
  return (label + ' ' + name)
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w.length > 2)
    .slice(0, 6)
    .join(' ');
}

function truncate(text: string, len: number): string {
  if (!text) return '';
  return text.length > len ? text.substring(0, len) + '...' : text;
}

function fillAllFields() {
  const fillable = suggestions.filter(s => !s.skipAutoFill && s.value);
  const scrollX = window.scrollX, scrollY = window.scrollY;
  const t0 = performance.now();
  let filled = 0;

  hasFilledAll = true;
  fillable.forEach((suggestion, i) => {
    const ok = fillField(suggestion);
    if (ok) {
      filled++;
      registerAccountIfNeeded(suggestion);
    }
    const item = document.querySelector(`#jr-tab-suggestions .qa-card[data-index="${i}"]`) as HTMLElement | null;
    if (item) updateCardState(item, suggestion, ok);
  });

  // Focus/click during filling scrolls the page around — put the user back
  window.scrollTo(scrollX, scrollY);

  const failed = fillable.length - filled;
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  const status = document.getElementById('jr-status');
  if (status) {
    status.classList.add('post');
    const okPct = Math.round((filled / Math.max(fillable.length, 1)) * 100);
    status.innerHTML = `
      <div class="qa-status-row">
        ${QA_SVG.checkSmall}
        <span class="qa-status-strong">${filled} filled</span>
        ${failed > 0 ? `<span class="qa-amber">\u00b7 ${failed} need you</span>` : ''}
        <span class="qa-spacer"></span>
        <span class="qa-dim12">${secs}s</span>
      </div>
      <div class="qa-bar"><span class="ok" style="width:${okPct}%"></span><span class="warn" style="width:${100 - okPct}%"></span></div>
    `;
  }
  const btn = document.getElementById('jr-fill-all');
  if (btn) btn.textContent = `Fill again (${fillable.length})`;

  showMessage(
    failed === 0 ? `${filled} fields filled \u00b7 logged to tracker` : `${filled} filled \u00b7 ${failed} need you`,
    failed === 0 ? 'success' : 'warning'
  );

  // Log this application in the tracker automatically
  sendMessage({
    type: 'saveApplication',
    application: {
      company: extractCompanyName(),
      position: extractJobTitle() || document.title,
      url: location.href,
      status: 'applied',
      source: 'autofill',
      notes: `Auto-filled ${filled}/${fillable.length} fields`,
      contacts: [], interviews: [], followUps: []
    }
  }).catch(() => {});
}

function fillField(suggestion: Suggestion): boolean {
  try {
    const el = suggestion.field.element;
    const value = suggestion.value;
    
    console.log('JobRight AI: Filling', suggestion.field.label, 'with', value, 'type:', suggestion.field.type);
    
    // Handle radio buttons FIRST (before general input handling)
    if (el instanceof HTMLInputElement && el.type === 'radio') {
      console.log('JobRight AI: Detected radio button, using fillRadio');
      return fillRadio(el, value);
    }
    
    // Handle checkboxes
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      console.log('JobRight AI: Detected checkbox');
      const shouldCheck = value.toLowerCase() === 'yes' || value.toLowerCase() === 'true' || value === '1';
      if (shouldCheck !== el.checked) {
        el.click();
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      highlightField(el);
      return true;
    }
    
    // Handle file inputs - skip
    if (el instanceof HTMLInputElement && el.type === 'file') {
      highlightField(el, '📎 Upload manually');
      return false;
    }
    
    // Native text inputs and textareas
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      suggestion.prevValue = el.value;
      suggestion.undoable = true;
      el.focus();
      setNativeValue(el, value);
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      highlightField(el);
      return true;
    }

    // Contenteditable rich text (Workday richTextArea etc.)
    if (el.isContentEditable) {
      el.focus();
      el.textContent = value;
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      highlightField(el);
      return true;
    }
    
    // Native selects
    if (el instanceof HTMLSelectElement) {
      suggestion.prevValue = el.value;
      suggestion.undoable = true;
      return fillNativeSelect(el, value);
    }
    
    // Custom dropdowns / divs with role
    if (suggestion.field.isCustom || suggestion.field.type === 'radio' || suggestion.field.type === 'select') {
      // Try to find actual form elements inside
      const innerRadio = el.querySelector('input[type="radio"]') as HTMLInputElement;
      if (innerRadio) {
        return fillRadio(innerRadio, value);
      }
      
      const innerSelect = el.querySelector('select') as HTMLSelectElement;
      if (innerSelect) {
        return fillNativeSelect(innerSelect, value);
      }
      
      // Fall back to custom dropdown handling
      return fillCustomDropdown(el, value, suggestion.field.label);
    }
    
    return false;
  } catch (error) {
    console.error('JobRight AI: Fill error:', error);
    return false;
  }
}

// React (Workday, Greenhouse, Lever...) ignores plain `el.value = x` — its internal
// value tracker sees no change and discards the input event. Must use the native setter.
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
              : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
              : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else (el as any).value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// Score how well an option's text matches the desired value. 0 = no match.
// Exact > word-boundary (for short values like "Yes"/"No" — plain includes()
// would match "No" against "Norway") > substring.
function optionMatchScore(optionText: string, value: string): number {
  const o = optionText.toLowerCase().trim();
  const v = value.toLowerCase().trim();
  if (!o || !v) return 0;
  if (o === v) return 3;
  if (new RegExp(`(^|\\W)${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\W|$)`).test(o)) return 2;
  if (v.length >= 3 && (o.includes(v) || v.includes(o))) return 1;
  return 0;
}

function pickBestOption<T>(options: T[], getText: (o: T) => string, value: string): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const opt of options) {
    const score = optionMatchScore(getText(opt), value);
    if (score > bestScore) {
      bestScore = score;
      best = opt;
    }
  }
  return best;
}

function fillNativeSelect(select: HTMLSelectElement, value: string): boolean {
  const option = pickBestOption(
    Array.from(select.options),
    o => o.text || o.value,
    value
  );
  if (option) {
    setNativeValue(select, option.value);
    highlightField(select);
    return true;
  }
  return false;
}

function fillRadio(firstRadio: HTMLInputElement, value: string): boolean {
  const name = firstRadio.name;
  let radios: NodeListOf<Element> | HTMLInputElement[];
  
  // Try to find radios by name, or get siblings if no name
  if (name) {
    radios = document.querySelectorAll(`input[type="radio"][name="${name}"]`);
  } else {
    // Find parent and look for radio siblings
    const parent = firstRadio.closest('fieldset, .form-group, .radio-group, div') || firstRadio.parentElement;
    radios = parent ? Array.from(parent.querySelectorAll('input[type="radio"]')) : [firstRadio];
  }
  
  const valueLower = value.toLowerCase().trim();
  console.log('JobRight AI: Filling radio, looking for:', valueLower, 'in', radios.length, 'options');
  
  for (const radio of Array.from(radios)) {
    const r = radio as HTMLInputElement;
    
    // Get label text from multiple sources
    let labelText = '';
    
    // 1. Check label[for]
    if (r.id) {
      const labelFor = document.querySelector(`label[for="${r.id}"]`);
      if (labelFor) labelText = labelFor.textContent || '';
    }
    
    // 2. Check parent label
    if (!labelText) {
      const parentLabel = r.closest('label');
      if (parentLabel) labelText = parentLabel.textContent || '';
    }
    
    // 3. Check adjacent text/span
    if (!labelText) {
      const next = r.nextElementSibling || r.nextSibling;
      if (next) labelText = next.textContent || '';
    }
    
    // 4. Check sibling span/label
    if (!labelText && r.parentElement) {
      const sibling = r.parentElement.querySelector('span, label');
      if (sibling) labelText = sibling.textContent || '';
    }
    
    // 5. Use value attribute
    if (!labelText) {
      labelText = r.value;
    }
    
    labelText = labelText.toLowerCase().trim();
    console.log('JobRight AI: Radio option:', labelText, 'value:', r.value);
    
    // Match logic
    const isMatch = 
      labelText === valueLower ||
      labelText.includes(valueLower) ||
      r.value.toLowerCase() === valueLower ||
      (valueLower === 'yes' && (labelText.includes('yes') || r.value.toLowerCase() === 'yes')) ||
      (valueLower === 'no' && (labelText.includes('no') || r.value.toLowerCase() === 'no')) ||
      (valueLower === 'true' && labelText.includes('yes')) ||
      (valueLower === 'false' && labelText.includes('no'));
    
    if (isMatch) {
      console.log('JobRight AI: Clicking radio:', labelText);
      
      // Multiple ways to click/select
      r.focus();
      r.checked = true;
      
      // Simulate actual click
      r.click();
      
      // Dispatch events
      r.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      r.dispatchEvent(new Event('input', { bubbles: true }));
      r.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Also click the parent label if exists
      const parentLabel = r.closest('label');
      if (parentLabel) {
        parentLabel.click();
      }
      
      highlightField(r);
      return true;
    }
  }
  
  console.log('JobRight AI: No matching radio found for:', valueLower);
  return false;
}

const DROPDOWN_OPTION_SELECTORS = [
  '[data-automation-id="promptOption"]', // Workday
  '[role="option"]',
  '[role="menuitem"]',
  '[data-automation-widget="wd-popup-list"] div[tabindex]',
  'ul[role="listbox"] li',
  '[class*="option"]',
  'li',
].join(', ');

function simulateClick(el: HTMLElement) {
  const opts = { bubbles: true, cancelable: true, view: window };
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  el.click();
}

// Options render asynchronously in a portal after the trigger is clicked —
// poll for them instead of guessing a delay.
function pollForOption(value: string, timeoutMs: number, onDone: (found: boolean) => void) {
  const start = Date.now();
  const tick = () => {
    // Only consider options that are visible (a dropdown is actually open)
    const candidates = Array.from(document.querySelectorAll(DROPDOWN_OPTION_SELECTORS))
      .filter(o => (o as HTMLElement).offsetParent !== null && (o.textContent || '').trim().length > 0);
    const best = pickBestOption(candidates, o => o.textContent || '', value);
    if (best) {
      simulateClick(best as HTMLElement);
      onDone(true);
      return;
    }
    if (Date.now() - start < timeoutMs) setTimeout(tick, 150);
    else onDone(false);
  };
  setTimeout(tick, 150);
}

function fillCustomDropdown(el: HTMLElement, value: string, questionLabel: string): boolean {
  console.log('JobRight AI: Attempting to fill custom dropdown:', questionLabel);

  // Open the dropdown
  const trigger = (el.querySelector('[data-automation-id*="dropdown"], [role="combobox"], button, [aria-haspopup]') as HTMLElement) || el;
  simulateClick(trigger);

  pollForOption(value, 2000, (found) => {
    if (found) {
      highlightField(el);
      return;
    }
    // Workday multiselect prompts: type into the search box, then pick the first result
    const searchInput = document.querySelector('[data-automation-id="searchBox"] input, [data-automation-id="multiselectInputContainer"] input') as HTMLInputElement;
    if (searchInput && searchInput.offsetParent !== null) {
      searchInput.focus();
      setNativeValue(searchInput, value);
      searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      pollForOption(value, 2500, (foundAfterSearch) => {
        if (foundAfterSearch) highlightField(el);
        else highlightField(el, `Select manually: ${value}`);
      });
      return;
    }
    console.log('JobRight AI: Could not find matching option for:', value);
    highlightField(el, `Select manually: ${value}`);
  });

  return true; // async attempt; field is highlighted with guidance if it fails
}

function highlightField(el: HTMLElement, message?: string) {
  const originalBg = el.style.backgroundColor;
  const originalOutline = el.style.outline;
  
  el.style.backgroundColor = '#dcfce7';
  el.style.outline = '2px solid #22c55e';
  
  if (message) {
    const tooltip = document.createElement('div');
    tooltip.style.cssText = `
      position: fixed;
      background: #1e293b;
      color: white;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 12px;
      z-index: 2147483647;
      white-space: nowrap;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    tooltip.textContent = message;
    
    const rect = el.getBoundingClientRect();
    tooltip.style.top = (rect.top + window.scrollY - 35) + 'px';
    tooltip.style.left = rect.left + 'px';
    document.body.appendChild(tooltip);
    
    setTimeout(() => tooltip.remove(), 3000);
  }
  
  setTimeout(() => {
    el.style.backgroundColor = originalBg;
    el.style.outline = originalOutline;
  }, 3000);
}

function showMessage(text: string, type: 'success' | 'warning' | 'info' | 'error') {
  const existing = document.getElementById('jobright-message');
  if (existing) existing.remove();

  // Toast: dark card, 3px left accent \u2014 lime / amber / neutral (amber, never red)
  const accents = { success: '#c9f24d', warning: '#f0b429', error: '#f0b429', info: '#8a8a86' };

  const msg = document.createElement('div');
  msg.id = 'jobright-message';
  msg.style.cssText = `
    position: fixed; bottom: 20px; left: 20px; z-index: 2147483647;
    display: flex; align-items: center; gap: 10px;
    background: #14140f; border: 1px solid #2e2e2b; border-left: 3px solid ${accents[type]};
    border-radius: 12px; padding: 11px 13px; max-width: 360px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px; font-weight: ${type === 'info' ? '400' : '600'};
    color: ${type === 'info' ? '#c4c4bf' : '#f4f4f2'};
    box-shadow: 0 18px 40px -14px rgba(0,0,0,.7);
  `;
  msg.textContent = text;
  document.body.appendChild(msg);
  setTimeout(() => msg.remove(), 5000);
}

function escapeHtml(text: string): string {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function showAIAssistant() {
  // Find unanswered textareas (likely open-ended questions)
  const textareas = Array.from(document.querySelectorAll('textarea'))
    .filter(t => isVisible(t) && !(t as HTMLTextAreaElement).value);
  
  if (textareas.length === 0) {
    showMessage('No empty text fields found for AI to help with.', 'info');
    return;
  }
  
  // Create AI assistant modal
  const modal = document.createElement('div');
  modal.id = 'jr-ai-modal';
  modal.innerHTML = `
    <style>
      #jr-ai-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      .jr-modal-content {
        background: white;
        border-radius: 16px;
        width: 90%;
        max-width: 600px;
        max-height: 80vh;
        overflow: hidden;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      }
      .jr-modal-header {
        background: linear-gradient(135deg, #0ea5e9, #6366f1);
        color: white;
        padding: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .jr-modal-header h3 { margin: 0; font-size: 18px; }
      .jr-modal-body {
        padding: 20px;
        max-height: 50vh;
        overflow-y: auto;
      }
      .jr-question-item {
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 16px;
      }
      .jr-question-label {
        font-size: 14px;
        font-weight: 500;
        color: #1e293b;
        margin-bottom: 12px;
      }
      .jr-ai-answer {
        background: #f0f9ff;
        border-radius: 8px;
        padding: 12px;
        font-size: 14px;
        color: #0369a1;
        min-height: 60px;
      }
      .jr-ai-loading {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #64748b;
      }
      .jr-ai-actions {
        display: flex;
        gap: 8px;
        margin-top: 12px;
      }
      .jr-ai-btn {
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        font-size: 13px;
        cursor: pointer;
      }
      .jr-ai-btn-use { background: #4F46E5; color: white; }
      .jr-ai-btn-improve { background: #f1f5f9; color: #475569; }
      .jr-ai-btn-regenerate { background: #fef3c7; color: #92400e; }
    </style>
    <div class="jr-modal-content">
      <div class="jr-modal-header">
        <h3>🤖 AI Answer Assistant</h3>
        <button class="jr-close" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 20px;">×</button>
      </div>
      <div class="jr-modal-body" id="jr-ai-questions">
        <div style="text-align: center; padding: 40px; color: #64748b;">
          <div style="font-size: 24px; margin-bottom: 8px;">✨</div>
          Analyzing ${textareas.length} question(s)...
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.querySelector('.jr-close')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
  
  // Generate answers for each textarea
  const container = document.getElementById('jr-ai-questions');
  if (!container) return;
  
  container.innerHTML = '';
  
  for (const textarea of textareas) {
    const ta = textarea as HTMLTextAreaElement;
    const label = getLabel(ta);
    
    if (label.length < 5) continue;
    
    const questionDiv = document.createElement('div');
    questionDiv.className = 'jr-question-item';
    questionDiv.innerHTML = `
      <div class="jr-question-label">${escapeHtml(label)}</div>
      <div class="jr-ai-answer" id="ai-answer-${ta.id || Math.random()}">
        <div class="jr-ai-loading">
          <span>🤔</span> Generating answer...
        </div>
      </div>
      <div class="jr-ai-actions" style="display: none;"></div>
    `;
    container.appendChild(questionDiv);
    
    // Generate answer
    try {
      const response = await sendMessage({
        type: 'aiAnswerQuestion',
        question: label,
        maxLength: 500
      });
      
      const answerDiv = questionDiv.querySelector('.jr-ai-answer');
      const actionsDiv = questionDiv.querySelector('.jr-ai-actions') as HTMLElement | null;
      
      if (response.answer) {
        if (answerDiv) answerDiv.textContent = response.answer;
        if (actionsDiv) {
          actionsDiv.style.display = 'flex';
          actionsDiv.innerHTML = `
            <button class="jr-ai-btn jr-ai-btn-use">✓ Use This</button>
            <button class="jr-ai-btn jr-ai-btn-improve">✨ Improve</button>
            <button class="jr-ai-btn jr-ai-btn-regenerate">🔄 Regenerate</button>
          `;
          
          actionsDiv.querySelector('.jr-ai-btn-use')?.addEventListener('click', () => {
            ta.value = response.answer;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            ta.dispatchEvent(new Event('change', { bubbles: true }));
            highlightField(ta);
            questionDiv.style.opacity = '0.5';
            showMessage('Answer applied!', 'success');
          });
          
          actionsDiv.querySelector('.jr-ai-btn-improve')?.addEventListener('click', async () => {
            if (answerDiv) answerDiv.innerHTML = '<div class="jr-ai-loading"><span>✨</span> Improving...</div>';
            const improved = await sendMessage({
              type: 'aiImproveAnswer',
              question: label,
              currentAnswer: response.answer
            });
            if (improved.answer && answerDiv) {
              answerDiv.textContent = improved.answer;
              response.answer = improved.answer;
            }
          });
          
          actionsDiv.querySelector('.jr-ai-btn-regenerate')?.addEventListener('click', async () => {
            if (answerDiv) answerDiv.innerHTML = '<div class="jr-ai-loading"><span>🔄</span> Regenerating...</div>';
            const newAnswer = await sendMessage({
              type: 'aiAnswerQuestion',
              question: label,
              maxLength: 500
            });
            if (newAnswer.answer && answerDiv) {
              answerDiv.textContent = newAnswer.answer;
              response.answer = newAnswer.answer;
            }
          });
        }
      } else {
        if (answerDiv) answerDiv.textContent = '❌ Could not generate an answer for this question.';
      }
    } catch (error) {
      const answerDiv = questionDiv.querySelector('.jr-ai-answer');
      if (answerDiv) answerDiv.textContent = '❌ Error: ' + error;
    }
  }
}

// ===========================================
// COVER LETTER GENERATOR
// ===========================================

async function showCoverLetterGenerator() {
  // Extract job description from the page
  const jobDescription = extractJobDescription();
  
  if (!jobDescription || jobDescription.length < 50) {
    showMessage('Could not find job description on this page. Please navigate to a job listing.', 'warning');
    return;
  }
  
  extractedJobDescription = jobDescription;
  
  // Create modal
  const modal = document.createElement('div');
  modal.id = 'jr-cover-letter-modal';
  modal.innerHTML = `
    <style>
      #jr-cover-letter-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      .jr-cl-content {
        background: white;
        border-radius: 16px;
        width: 95%;
        max-width: 800px;
        max-height: 90vh;
        overflow: hidden;
        box-shadow: 0 25px 80px rgba(0,0,0,0.4);
      }
      .jr-cl-header {
        background: linear-gradient(135deg, #4F46E5, #7C3AED);
        color: white;
        padding: 20px 24px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .jr-cl-header h3 { margin: 0; font-size: 20px; }
      .jr-cl-close {
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 20px;
      }
      .jr-cl-body {
        padding: 24px;
        max-height: 60vh;
        overflow-y: auto;
      }
      .jr-cl-section {
        margin-bottom: 20px;
      }
      .jr-cl-section label {
        display: block;
        font-weight: 600;
        color: #1f2937;
        margin-bottom: 8px;
        font-size: 14px;
      }
      .jr-cl-job-preview {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 12px;
        font-size: 13px;
        color: #334155;
        max-height: 100px;
        overflow-y: auto;
      }
      .jr-cl-textarea {
        width: 100%;
        min-height: 300px;
        padding: 16px;
        border: 2px solid #e2e8f0;
        border-radius: 12px;
        font-size: 14px;
        line-height: 1.6;
        resize: vertical;
        font-family: inherit;
      }
      .jr-cl-textarea:focus {
        outline: none;
        border-color: #4F46E5;
        box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.12);
      }
      .jr-cl-actions {
        padding: 16px 24px;
        background: #f8fafc;
        border-top: 1px solid #e2e8f0;
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      .jr-cl-btn {
        padding: 12px 20px;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: all 0.15s ease;
      }
      .jr-cl-btn-primary {
        background: linear-gradient(135deg, #4F46E5, #7C3AED);
        color: white;
        box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2);
      }
      .jr-cl-btn-primary:hover { background: linear-gradient(135deg, #4338ca, #6d28d9); }
      .jr-cl-btn-secondary {
        background: #f1f5f9;
        color: #475569;
        border: 1px solid #e2e8f0;
      }
      .jr-cl-btn-secondary:hover { background: #e2e8f0; }
      .jr-cl-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .jr-cl-status {
        padding: 12px 16px;
        background: #eef2ff;
        color: #4338ca;
        border-radius: 8px;
        font-size: 13px;
        margin-bottom: 16px;
        display: none;
      }
      .jr-cl-status.show { display: block; }
      .jr-cl-status.error { background: #fee2e2; color: #991b1b; }
      .jr-cl-status.success { background: #dcfce7; color: #166534; }
      .jr-quick-chip {
        padding: 6px 12px;
        background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%);
        border: 1px solid #c4b5fd;
        border-radius: 20px;
        font-size: 12px;
        color: #5b21b6;
        cursor: pointer;
        transition: all 0.2s;
        font-weight: 500;
      }
      .jr-quick-chip:hover {
        background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
        border-color: #818cf8;
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(79, 70, 229, 0.25);
      }
      .jr-quick-chip:active {
        transform: translateY(0);
      }
      .jr-quick-chip.selected {
        background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);
        color: white;
        border-color: #4F46E5;
      }
    </style>
    <div class="jr-cl-content">
      <div class="jr-cl-header">
        <h3>📝 Cover Letter Generator</h3>
        <button class="jr-cl-close" id="jr-cl-close">×</button>
      </div>
      <div class="jr-cl-body">
        <div class="jr-cl-status" id="jr-cl-status"></div>
        
        <div class="jr-cl-section">
          <label>📋 Detected Job Description (${jobDescription.length} chars)</label>
          <div class="jr-cl-job-preview">${escapeHtml(jobDescription.substring(0, 500))}${jobDescription.length > 500 ? '...' : ''}</div>
        </div>
        
        <div class="jr-cl-section">
          <label>✉️ Your Cover Letter</label>
          <textarea class="jr-cl-textarea" id="jr-cl-textarea" placeholder="Click 'Generate Cover Letter' to create a personalized cover letter based on the job description and your profile..."></textarea>
        </div>
        
        <div class="jr-cl-section" id="jr-cl-instructions-section" style="display: none;">
          <label>💬 Tell AI Exactly What to Change</label>
          <div id="jr-cl-quick-instructions" style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;">
            <button class="jr-quick-chip" data-instruction="Make the opening hook more compelling and attention-grabbing">🎯 Stronger Hook</button>
            <button class="jr-quick-chip" data-instruction="Emphasize my leadership and team management experience">👔 Leadership Focus</button>
            <button class="jr-quick-chip" data-instruction="Make it sound more confident and assertive">💪 More Confident</button>
            <button class="jr-quick-chip" data-instruction="Use a more conversational, friendly startup tone">😊 Casual Tone</button>
            <button class="jr-quick-chip" data-instruction="Make it more formal and corporate">👔 Formal Tone</button>
            <button class="jr-quick-chip" data-instruction="Make it shorter and more concise">📏 Shorter</button>
          </div>
          <textarea id="jr-cl-instructions" style="width: 100%; min-height: 60px; padding: 12px; border: 2px solid #4F46E5; border-radius: 8px; font-size: 13px; resize: vertical; background: #f5f3ff;" placeholder="Optional: Add specific instructions to refine the letter...
• 'Focus more on my Python experience'
• 'Make it sound more enthusiastic'
• 'Emphasize my startup background'"></textarea>
        </div>
      </div>
      <div class="jr-cl-actions">
        <button class="jr-cl-btn jr-cl-btn-primary" id="jr-cl-generate">
          ✨ Generate Cover Letter
        </button>
        <button class="jr-cl-btn jr-cl-btn-primary" id="jr-cl-improve" disabled>
          🔧 Apply Instructions
        </button>
        <button class="jr-cl-btn jr-cl-btn-secondary" id="jr-cl-copy" disabled>
          📋 Copy to Clipboard
        </button>
        <button class="jr-cl-btn jr-cl-btn-secondary" id="jr-cl-download" disabled>
          📄 Download PDF
        </button>
        <button class="jr-cl-btn jr-cl-btn-primary" id="jr-cl-upload" disabled>
          📤 Upload & Close
        </button>
      </div>
      <div style="padding: 12px 24px; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 11px; color: #64748b;">
        💡 All cover letters are auto-saved. View them in Options → History.
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const textarea = modal.querySelector('#jr-cl-textarea') as HTMLTextAreaElement;
  const instructionsInput = modal.querySelector('#jr-cl-instructions') as HTMLTextAreaElement;
  const instructionsSection = modal.querySelector('#jr-cl-instructions-section') as HTMLElement;
  const statusEl = modal.querySelector('#jr-cl-status') as HTMLElement;
  const generateBtn = modal.querySelector('#jr-cl-generate') as HTMLButtonElement;
  const improveBtn = modal.querySelector('#jr-cl-improve') as HTMLButtonElement;
  const copyBtn = modal.querySelector('#jr-cl-copy') as HTMLButtonElement;
  const downloadBtn = modal.querySelector('#jr-cl-download') as HTMLButtonElement;
  const uploadBtn = modal.querySelector('#jr-cl-upload') as HTMLButtonElement;
  
  // Close button
  modal.querySelector('#jr-cl-close')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
  
  // Quick instruction chips
  const quickChips = modal.querySelectorAll('.jr-quick-chip');
  quickChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const instruction = chip.getAttribute('data-instruction');
      if (instruction && instructionsInput) {
        // Toggle selection
        const isSelected = chip.classList.contains('selected');
        
        if (isSelected) {
          // Deselect - remove this instruction
          chip.classList.remove('selected');
          const currentText = instructionsInput.value;
          instructionsInput.value = currentText
            .split('\n')
            .filter(line => !line.includes(instruction))
            .join('\n')
            .trim();
        } else {
          // Select - add this instruction
          chip.classList.add('selected');
          const currentText = instructionsInput.value.trim();
          instructionsInput.value = currentText 
            ? `${currentText}\n• ${instruction}`
            : `• ${instruction}`;
        }
        
        // Focus the textarea so user can see/edit
        instructionsInput.focus();
      }
    });
  });
  
  // Generate cover letter
  generateBtn.addEventListener('click', async () => {
    setStatus('🤔 Generating personalized cover letter...', 'info');
    generateBtn.disabled = true;
    
    try {
      const response = await sendMessage({
        type: 'generateCoverLetter',
        jobDescription,
        companyName: extractCompanyName(),
        jobTitle: extractJobTitle()
      });
      
      if (response.coverLetter) {
        textarea.value = response.coverLetter;
        setStatus('✅ Cover letter generated! Review, edit, or use the buttons below to refine.', 'success');
        improveBtn.disabled = false;
        copyBtn.disabled = false;
        downloadBtn.disabled = false;
        uploadBtn.disabled = false;
        instructionsSection.style.display = 'block';
      } else {
        setStatus('❌ ' + (response.error || 'Failed to generate cover letter'), 'error');
      }
    } catch (error) {
      setStatus('❌ Error: ' + error, 'error');
    }
    
    generateBtn.disabled = false;
  });
  
  // Improve with custom instructions
  improveBtn.addEventListener('click', async () => {
    if (!textarea.value) {
      setStatus('⚠️ Please generate a cover letter first before improving it!', 'error');
      return;
    }
    const customInstructions = instructionsInput?.value?.trim() || '';
    if (!customInstructions) {
      setStatus('💡 Tip: Enter specific instructions above for better results! Improving with general enhancements...', 'info');
    } else {
      setStatus('✨ Applying your instructions: "' + customInstructions.substring(0, 50) + (customInstructions.length > 50 ? '...' : '') + '"', 'info');
    }
    improveBtn.disabled = true;
    
    try {
      const response = await sendMessage({
        type: 'improveCoverLetter',
        coverLetter: textarea.value,
        jobDescription,
        customInstructions
      });
      
      if (response.coverLetter) {
        textarea.value = response.coverLetter;
        if (customInstructions) {
          setStatus('✅ Cover letter improved with your instructions! Review the changes.', 'success');
        } else {
          setStatus('✅ Cover letter enhanced! Add specific instructions above for targeted improvements.', 'success');
        }
        if (instructionsInput) instructionsInput.value = ''; // Clear after applying
      } else if (response.error) {
        setStatus('❌ ' + response.error, 'error');
      }
    } catch (error) {
      setStatus('❌ Error improving cover letter: ' + error, 'error');
    }
    
    improveBtn.disabled = false;
  });
  
  // Copy to clipboard
  copyBtn.addEventListener('click', async () => {
    if (!textarea.value) {
      setStatus('⚠️ Nothing to copy yet!', 'error');
      return;
    }
    
    try {
      await navigator.clipboard.writeText(textarea.value);
      setStatus('✅ Copied to clipboard!', 'success');
    } catch (error) {
      // Fallback
      textarea.select();
      document.execCommand('copy');
      setStatus('✅ Copied to clipboard!', 'success');
    }
  });
  
  // Download as PDF
  downloadBtn.addEventListener('click', async () => {
    if (!textarea.value) {
      setStatus('⚠️ Nothing to download yet!', 'error');
      return;
    }
    
    const companyName = extractCompanyName().replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
    const jobTitleShort = extractJobTitle().replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `Cover_Letter_${companyName}_${jobTitleShort}_${dateStr}.pdf`;
    
    setStatus('📄 Generating PDF...', 'info');
    downloadBtn.disabled = true;
    
    try {
      // Check if jsPDF is already loaded
      // @ts-ignore
      if (!window.jspdf) {
        // Load jsPDF dynamically
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('jsPDF loading timeout'));
          }, 10000); // 10 second timeout
          
          script.onload = () => {
            clearTimeout(timeout);
            resolve(true);
          };
          script.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('Failed to load jsPDF library'));
          };
          document.head.appendChild(script);
        });
      }
      
      // @ts-ignore - jsPDF is loaded dynamically
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      
      // Get profile info for header
      const profileResponse = await sendMessage({ type: 'getActiveProfile' });
      const profile = profileResponse ? await sendMessage({ type: 'getProfile', profileId: profileResponse }) : null;
      
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
      const today = new Date();
      const dateString = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      yPos += 5;
      doc.setFontSize(10);
      doc.text(dateString, margin, yPos);
      yPos += 10;
      
      // Add company and job title
      const company = extractCompanyName();
      const jobTitle = extractJobTitle();
      if (company || jobTitle) {
        yPos += 5;
        doc.setFontSize(10);
        if (company) {
          doc.text(company, margin, yPos);
          yPos += 5;
        }
        if (jobTitle) {
          doc.text(jobTitle, margin, yPos);
          yPos += 10;
        }
      }
      
      // Add greeting
      yPos += 5;
      doc.setFontSize(11);
      doc.text('Dear Hiring Manager,', margin, yPos);
      yPos += 10;
      
      // Add cover letter body
      const coverLetterText = textarea.value;
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
      doc.save(fileName);
      
      // Also save locally
      await saveCoverLetterLocally(textarea.value, companyName, extractJobTitle());
      
      setStatus(`✅ PDF downloaded: ${fileName}`, 'success');
    } catch (error) {
      console.error('PDF generation error:', error);
      setStatus('❌ PDF generation failed: ' + error + '. Trying text download...', 'error');
      
      // Fallback to text download
      try {
        const blob = new Blob([textarea.value], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName.replace('.pdf', '.txt');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setStatus('✅ Downloaded as text file (PDF failed)', 'success');
      } catch (fallbackError) {
        setStatus('❌ Download failed: ' + fallbackError, 'error');
      }
    } finally {
      downloadBtn.disabled = false;
    }
  });
  
  // Upload to form
  uploadBtn.addEventListener('click', async () => {
    if (!textarea.value) return;
    
    // Generate unique filename
    const companyName = extractCompanyName().replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
    const jobTitleShort = extractJobTitle().replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
    const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const fileName = `Cover_Letter_${companyName}_${jobTitleShort}_${dateStr}.txt`;
    
    // Find file input for cover letter
    const fileInput = findCoverLetterFileInput();
    
    if (fileInput) {
      setStatus('📤 Creating and uploading cover letter...', 'info');
      
      try {
        // Create a text file blob
        const blob = new Blob([textarea.value], { type: 'text/plain' });
        const file = new File([blob], fileName, { type: 'text/plain' });
        
        // Create a DataTransfer to set the file
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;
        
        // Dispatch events
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        fileInput.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Save cover letter locally
        await saveCoverLetterLocally(textarea.value, companyName, extractJobTitle());
        
        setStatus('✅ Uploaded & saved! Closing in 2 seconds...', 'success');
        highlightField(fileInput);
        
        // Close modal after short delay
        setTimeout(() => {
          modal.remove();
          showMessage(`Cover letter uploaded: ${fileName}`, 'success');
        }, 2000);
        
      } catch (error) {
        setStatus('⚠️ Auto-upload failed. Please copy and paste manually.', 'error');
      }
    } else {
      // No file input found - try to find a textarea
      const coverLetterTextarea = findCoverLetterTextarea();
      
      if (coverLetterTextarea) {
        coverLetterTextarea.value = textarea.value;
        coverLetterTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        coverLetterTextarea.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Save cover letter locally
        await saveCoverLetterLocally(textarea.value, companyName, extractJobTitle());
        
        setStatus('✅ Pasted & saved! Closing in 2 seconds...', 'success');
        highlightField(coverLetterTextarea);
        
        // Close modal after short delay
        setTimeout(() => {
          modal.remove();
          showMessage('Cover letter applied to form!', 'success');
        }, 2000);
      } else {
        setStatus('⚠️ No cover letter field found. Use "Copy to Clipboard" and paste manually.', 'error');
      }
    }
  });
  
  function setStatus(message: string, type: 'info' | 'error' | 'success') {
    statusEl.textContent = message;
    statusEl.className = 'jr-cl-status show ' + type;
  }
}

// Extract job description from the page
function extractJobDescription(): string {
  const selectors = [
    // Common job description containers
    '[class*="job-description"]',
    '[class*="jobDescription"]',
    '[class*="job_description"]',
    '[class*="description"]',
    '[id*="job-description"]',
    '[id*="jobDescription"]',
    '[data-testid*="description"]',
    '.job-details',
    '.job-content',
    '.posting-description',
    '.vacancy-description',
    'article[class*="job"]',
    '[itemprop="description"]',
    // Common sections
    'section[class*="description"]',
    'div[class*="details"]',
    // Greenhouse, Lever, Workday patterns
    '.section-wrapper',
    '.content-wrapper',
    '.job-post-content',
  ];
  
  let bestMatch = '';
  let bestLength = 0;
  
  // Try specific selectors first
  for (const selector of selectors) {
    try {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        const text = (el as HTMLElement).innerText?.trim() || '';
        if (text.length > bestLength && text.length < 10000) {
          // Check if it looks like a job description
          const hasKeywords = /responsibilities|requirements|qualifications|experience|skills|about|role|position|team|company/i.test(text);
          if (hasKeywords || text.length > 200) {
            bestMatch = text;
            bestLength = text.length;
          }
        }
      });
    } catch (e) {}
  }
  
  // If no specific match, try to get main content
  if (bestLength < 100) {
    const mainContent = document.querySelector('main, [role="main"], article, .content');
    if (mainContent) {
      const text = (mainContent as HTMLElement).innerText?.trim() || '';
      if (text.length > 100) {
        bestMatch = text.substring(0, 5000);
      }
    }
  }
  
  // Final fallback - get visible text from page
  if (bestLength < 100) {
    const body = document.body.innerText || '';
    bestMatch = body.substring(0, 5000);
  }
  
  return bestMatch;
}

// Extract company name from the page
function extractCompanyName(): string {
  const selectors = [
    '[class*="company-name"]',
    '[class*="companyName"]',
    '[class*="employer"]',
    '[itemprop="hiringOrganization"]',
    '[data-testid*="company"]',
    'h1, h2',
  ];
  
  for (const selector of selectors) {
    try {
      const el = document.querySelector(selector);
      const text = el?.textContent?.trim() || '';
      if (text.length > 2 && text.length < 100) {
        return text;
      }
    } catch (e) {}
  }
  
  // Try to extract from title
  const title = document.title;
  const match = title.match(/at\s+([^|]+)|([^|]+)\s*\|/i);
  if (match) {
    return (match[1] || match[2]).trim();
  }
  
  return 'the company';
}

// Extract job title from the page
function extractJobTitle(): string {
  const selectors = [
    '[class*="job-title"]',
    '[class*="jobTitle"]',
    '[class*="job_title"]',
    '[itemprop="title"]',
    'h1[class*="title"]',
    'h1',
  ];
  
  for (const selector of selectors) {
    try {
      const el = document.querySelector(selector);
      const text = el?.textContent?.trim() || '';
      if (text.length > 3 && text.length < 200) {
        return text;
      }
    } catch (e) {}
  }
  
  return 'this position';
}

// Find cover letter file input
function findCoverLetterFileInput(): HTMLInputElement | null {
  const inputs = document.querySelectorAll('input[type="file"]');
  
  for (const input of Array.from(inputs)) {
    const el = input as HTMLInputElement;
    const label = getLabel(el).toLowerCase();
    const name = (el.name || el.id || '').toLowerCase();
    
    if (label.includes('cover') || name.includes('cover') ||
        label.includes('letter') || name.includes('letter') ||
        label.includes('motivation')) {
      return el;
    }
  }
  
  // Return second file input if exists (often resume is first, cover letter second)
  if (inputs.length >= 2) {
    return inputs[1] as HTMLInputElement;
  }
  
  return null;
}

// Find cover letter textarea
function findCoverLetterTextarea(): HTMLTextAreaElement | null {
  const textareas = document.querySelectorAll('textarea');
  
  for (const ta of Array.from(textareas)) {
    const textarea = ta as HTMLTextAreaElement;
    const label = getLabel(textarea).toLowerCase();
    const name = (textarea.name || textarea.id || '').toLowerCase();
    
    if (label.includes('cover') || name.includes('cover') ||
        label.includes('letter') || name.includes('letter') ||
        label.includes('motivation') || label.includes('why')) {
      return textarea;
    }
  }
  
  return null;
}

// Save cover letter locally for future reference
async function saveCoverLetterLocally(content: string, companyName: string, jobTitle: string): Promise<void> {
  try {
    const coverLetter = {
      id: crypto.randomUUID(),
      company: companyName,
      jobTitle: jobTitle,
      content: content,
      url: window.location.href,
      createdAt: new Date().toISOString(),
      wordCount: content.split(/\s+/).length
    };
    
    // Get existing cover letters
    const result = await chrome.storage.local.get('savedCoverLetters');
    const savedCoverLetters = result.savedCoverLetters || [];
    
    // Add new one at the beginning
    savedCoverLetters.unshift(coverLetter);
    
    // Keep only last 50 cover letters
    if (savedCoverLetters.length > 50) {
      savedCoverLetters.splice(50);
    }
    
    // Save back
    await chrome.storage.local.set({ savedCoverLetters });
    
    // Also save for AI learning
    await saveForAILearning(content, companyName, jobTitle);
    
    console.log('JobRight AI: Cover letter saved locally:', coverLetter.id);
  } catch (error) {
    console.error('JobRight AI: Failed to save cover letter locally:', error);
  }
}

// Save content for AI to learn from
async function saveForAILearning(content: string, companyName: string, jobTitle: string): Promise<void> {
  try {
    // Use consistent key with background.ts
    const result = await chrome.storage.local.get('coverLetterLearning');
    const learningData = result.coverLetterLearning || {
      coverLetterExamples: [],
      preferredPhrases: [],
      openingHooks: [],
      closingStatements: [],
      actionVerbs: [],
      tonePreferences: {
        formal: 0,
        conversational: 0
      },
      lastUpdated: null
    };
    
    // Save this cover letter as an example (keep last 10)
    learningData.coverLetterExamples.unshift({
      content: content.substring(0, 2500),
      company: companyName,
      jobTitle: jobTitle,
      date: new Date().toISOString(),
      wordCount: content.split(/\s+/).length
    });
    
    if (learningData.coverLetterExamples.length > 10) {
      learningData.coverLetterExamples.splice(10);
    }
    
    // Extract paragraphs
    const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 50);
    
    // Extract opening hook (first substantive paragraph after greeting)
    const bodyStart = paragraphs.findIndex(p => 
      !p.includes('@') && 
      !p.includes('Dear') && 
      !p.includes('Sincerely') &&
      p.length > 100
    );
    if (bodyStart >= 0 && paragraphs[bodyStart]) {
      const openingHook = paragraphs[bodyStart].substring(0, 200);
      if (!learningData.openingHooks.some((h: any) => h.text.substring(0, 50) === openingHook.substring(0, 50))) {
        learningData.openingHooks.unshift({
          text: openingHook,
          company: companyName,
          date: new Date().toISOString()
        });
        if (learningData.openingHooks.length > 5) {
          learningData.openingHooks.splice(5);
        }
      }
    }
    
    // Extract closing statement (last paragraph before signature)
    const closingIdx = paragraphs.findIndex(p => p.includes('Sincerely') || p.includes('Best') || p.includes('Regards'));
    if (closingIdx > 0 && paragraphs[closingIdx - 1]) {
      const closing = paragraphs[closingIdx - 1].substring(0, 200);
      if (!learningData.closingStatements.some((c: any) => c.text.substring(0, 50) === closing.substring(0, 50))) {
        learningData.closingStatements.unshift({
          text: closing,
          date: new Date().toISOString()
        });
        if (learningData.closingStatements.length > 5) {
          learningData.closingStatements.splice(5);
        }
      }
    }
    
    // Extract action verbs the user commonly uses
    const actionVerbPatterns = /\b(led|built|drove|increased|reduced|launched|managed|created|developed|implemented|designed|orchestrated|spearheaded|achieved|delivered|optimized|scaled|transformed|pioneered|established)\b/gi;
    const foundVerbs = content.match(actionVerbPatterns) || [];
    foundVerbs.forEach(verb => {
      const normalizedVerb = verb.toLowerCase();
      const existing = learningData.actionVerbs.find((v: any) => v.verb === normalizedVerb);
      if (existing) {
        existing.count++;
      } else {
        learningData.actionVerbs.push({ verb: normalizedVerb, count: 1 });
      }
    });
    learningData.actionVerbs.sort((a: any, b: any) => b.count - a.count);
    if (learningData.actionVerbs.length > 15) {
      learningData.actionVerbs.splice(15);
    }
    
    // Detect tone preference
    const formalIndicators = (content.match(/\b(furthermore|moreover|therefore|hereby|pursuant|henceforth|regarding|accordingly)\b/gi) || []).length;
    const conversationalIndicators = (content.match(/\b(excited|thrilled|love|amazing|awesome|really|actually|honestly)\b/gi) || []).length;
    
    if (formalIndicators > conversationalIndicators) {
      learningData.tonePreferences.formal++;
    } else if (conversationalIndicators > formalIndicators) {
      learningData.tonePreferences.conversational++;
    }
    
    // Extract and save preferred phrases (sentences that appear in multiple cover letters)
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 30 && s.trim().length < 150);
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      // Skip generic sentences
      if (trimmed.toLowerCase().includes('dear team') || 
          trimmed.toLowerCase().includes('sincerely') ||
          trimmed.toLowerCase().includes('thank you for')) {
        continue;
      }
      
      const existingIndex = learningData.preferredPhrases.findIndex(
        (p: any) => p.phrase.toLowerCase().includes(trimmed.toLowerCase().substring(0, 40)) ||
                    trimmed.toLowerCase().includes(p.phrase.toLowerCase().substring(0, 40))
      );
      
      if (existingIndex >= 0) {
        learningData.preferredPhrases[existingIndex].count++;
        learningData.preferredPhrases[existingIndex].lastUsed = new Date().toISOString();
      } else if (learningData.preferredPhrases.length < 50) {
        learningData.preferredPhrases.push({
          phrase: trimmed,
          count: 1,
          lastUsed: new Date().toISOString()
        });
      }
    }
    
    // Sort by usage count
    learningData.preferredPhrases.sort((a: any, b: any) => b.count - a.count);
    
    // Keep only top 25 most used phrases
    if (learningData.preferredPhrases.length > 25) {
      learningData.preferredPhrases.splice(25);
    }
    
    learningData.lastUpdated = new Date().toISOString();
    
    await chrome.storage.local.set({ coverLetterLearning: learningData });
    console.log('JobRight AI: Cover letter learning data updated with', {
      examples: learningData.coverLetterExamples.length,
      phrases: learningData.preferredPhrases.length,
      actionVerbs: learningData.actionVerbs.length
    });
  } catch (error) {
    console.error('JobRight AI: Failed to save learning data:', error);
  }
}
