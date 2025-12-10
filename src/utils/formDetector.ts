// Form detection and question extraction utilities
// Enhanced with Workday, Greenhouse, Lever, and other ATS support

import { DetectedField } from '../types.js';

const SENSITIVE_KEYWORDS = [
  'ssn', 'social security', 'bank account', 'card number', 'password',
  "mother's maiden name", 'pin', 'security code', 'cvv'
];

// ATS-specific selectors for major platforms
const ATS_SELECTORS = {
  // Workday specific selectors
  workday: {
    inputs: [
      '[data-automation-id]',
      '[data-uxi-element-id]',
      'input[id*="input"]',
      'textarea[data-automation-id]',
      '[role="textbox"]',
      '[role="combobox"]',
      '[role="listbox"]',
      '.css-1hwfws3', // Workday's select containers
      '[data-automation-widget="wd-popup-list"]',
    ],
    labels: [
      '[data-automation-id*="label"]',
      '.gwt-Label',
      '[data-uxi-widget-type="selectinputlabel"]',
      '.WEOC',
      '.WE0F',
    ],
    containers: [
      '[data-automation-id*="formField"]',
      '[data-automation-id*="section"]',
      '.WM4P',
      '.WGVO',
    ],
    customDropdowns: [
      '[data-automation-id*="dropdown"]',
      '[data-automation-id*="selectWidget"]',
      '[data-automation-id="multiselectInputContainer"]',
      '[role="listbox"]',
    ]
  },
  // Greenhouse
  greenhouse: {
    inputs: [
      'input[name*="job_application"]',
      'textarea[name*="job_application"]',
      'select[name*="job_application"]',
      '.field input',
      '.field textarea',
      '.field select',
    ],
    labels: ['.field label', '.field-label'],
    containers: ['.field', '.application-field'],
  },
  // Lever
  lever: {
    inputs: [
      '[name*="cards"]',
      '.application-question input',
      '.application-question textarea',
      '.application-question select',
    ],
    labels: ['.application-label', '.posting-category-title'],
    containers: ['.application-question', '.posting-categories'],
  },
  // iCIMS
  icims: {
    inputs: [
      '[id*="iCIMS"]',
      '.iCIMS_InfoFields input',
      '.iCIMS_InfoFields textarea',
      '.iCIMS_InfoFields select',
    ],
    labels: ['.iCIMS_InfoFieldLabel'],
    containers: ['.iCIMS_InfoField'],
  },
  // Taleo
  taleo: {
    inputs: [
      '[id*="requisition"]',
      '.ftlEditableControl',
      'input.tbEditableControl',
      'textarea.tbEditableControl',
      'select.ftlDropDown',
    ],
    labels: ['.ftlLabelL', '.contentFieldLabel'],
    containers: ['.contentCellData'],
  },
  // SmartRecruiters
  smartrecruiters: {
    inputs: [
      '[data-test*="input"]',
      '[data-test*="textarea"]',
      '[data-test*="select"]',
      '.srtm-input',
      '.srtm-textarea',
    ],
    labels: ['[data-test*="label"]', '.srtm-label'],
    containers: ['.srtm-field'],
  },
  // Ashby
  ashby: {
    inputs: [
      '[name*="__field"]',
      '.ashby-application-form-field input',
      '.ashby-application-form-field textarea',
    ],
    labels: ['.ashby-application-form-field label'],
    containers: ['.ashby-application-form-field'],
  },
};

// Detect which ATS platform we're on
function detectATSPlatform(): string | null {
  const url = window.location.href.toLowerCase();
  const hostname = window.location.hostname.toLowerCase();
  
  // Workday detection
  if (
    hostname.includes('workday.com') ||
    hostname.includes('myworkday') ||
    hostname.includes('wd3.') ||
    hostname.includes('wd5.') ||
    url.includes('/wd/') ||
    document.querySelector('[data-automation-id]') ||
    document.querySelector('[data-uxi-element-id]')
  ) {
    return 'workday';
  }
  
  // Greenhouse
  if (hostname.includes('greenhouse.io') || document.querySelector('#greenhouse_app')) {
    return 'greenhouse';
  }
  
  // Lever
  if (hostname.includes('lever.co') || hostname.includes('jobs.lever.co')) {
    return 'lever';
  }
  
  // iCIMS
  if (hostname.includes('icims.com') || document.querySelector('[id*="iCIMS"]')) {
    return 'icims';
  }
  
  // Taleo
  if (hostname.includes('taleo') || document.querySelector('.ftlEditableControl')) {
    return 'taleo';
  }
  
  // SmartRecruiters
  if (hostname.includes('smartrecruiters.com') || document.querySelector('[class*="srtm"]')) {
    return 'smartrecruiters';
  }
  
  // Ashby
  if (hostname.includes('ashbyhq.com') || document.querySelector('.ashby-application-form-field')) {
    return 'ashby';
  }
  
  return null;
}

export function detectFormFields(): DetectedField[] {
  const fields: DetectedField[] = [];
  const processed = new Set<HTMLElement>();
  const ats = detectATSPlatform();
  
  console.log('JobRight AI: Detected ATS platform:', ats || 'generic');
  
  // Find all form inputs (including Shadow DOM and iframes)
  const inputs = findAllInputs(ats);
  
  inputs.forEach((input) => {
    if (processed.has(input as HTMLElement)) return;
    
    const element = input as HTMLElement;
    const tagName = element.tagName.toLowerCase();
    
    // Skip hidden inputs
    if (element.getAttribute('type') === 'hidden') return;
    
    // Skip if in a hidden container
    if (!isElementVisible(element)) return;
    
    const questionText = extractQuestionText(element, ats);
    const inputType = getInputType(element);
    const selector = generateSelector(element);
    
    if (questionText) {
      fields.push({
        element,
        questionText,
        inputType,
        selector,
        label: getLabelText(element),
        placeholder: (element as HTMLInputElement).placeholder || undefined
      });
      processed.add(element);
    }
  });

  return fields;
}

// Enhanced input finder with Shadow DOM, iframe, and ATS-specific support
function findAllInputs(ats: string | null): Element[] {
  const allInputs: Element[] = [];
  
  // Get ATS-specific selectors or use generic
  const atsConfig = ats ? ATS_SELECTORS[ats as keyof typeof ATS_SELECTORS] : null;
  
  // 1. Standard DOM inputs
  const standardSelectors = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select, [role="textbox"], [role="combobox"], [contenteditable="true"]';
  document.querySelectorAll(standardSelectors).forEach(el => {
    if (!allInputs.includes(el)) allInputs.push(el);
  });
  
  // 2. ATS-specific inputs
  if (atsConfig?.inputs) {
    atsConfig.inputs.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(el => {
          if (!allInputs.includes(el)) allInputs.push(el);
        });
      } catch (e) {
        // Invalid selector, skip
      }
    });
  }
  
  // 3. Shadow DOM traversal (including closed shadow roots where possible)
  traverseShadowDOM(document.body, (shadowRoot) => {
    shadowRoot.querySelectorAll(standardSelectors).forEach(input => {
      if (!allInputs.includes(input)) {
        allInputs.push(input);
      }
    });
    
    if (atsConfig?.inputs) {
      atsConfig.inputs.forEach(selector => {
        try {
          shadowRoot.querySelectorAll(selector).forEach(el => {
            if (!allInputs.includes(el)) allInputs.push(el);
          });
        } catch (e) {}
      });
    }
  });
  
  // 4. Iframe support (same-origin only)
  traverseIframes((iframeDoc) => {
    iframeDoc.querySelectorAll(standardSelectors).forEach(input => {
      if (!allInputs.includes(input)) {
        allInputs.push(input);
      }
    });
  });
  
  // 5. Workday-specific: Find custom components
  if (ats === 'workday') {
    findWorkdayCustomInputs().forEach(el => {
      if (!allInputs.includes(el)) allInputs.push(el);
    });
  }
  
  return allInputs;
}

// Deep Shadow DOM traversal
function traverseShadowDOM(root: Element | Document, callback: (shadowRoot: ShadowRoot) => void) {
  const walker = document.createTreeWalker(
    root instanceof Document ? root.body : root,
    NodeFilter.SHOW_ELEMENT,
    null
  );
  
  let node: Node | null = walker.currentNode;
  while (node) {
    const element = node as Element;
    
    // Check for shadow root (open)
    if (element.shadowRoot) {
      callback(element.shadowRoot);
      // Recursively traverse nested shadow DOMs
      traverseShadowDOM(element.shadowRoot as unknown as Document, callback);
    }
    
    // Try to access closed shadow root via internals (won't work in most cases)
    try {
      const shadowRoot = (element as any).shadowRoot || (element as any)._shadowRoot;
      if (shadowRoot && typeof shadowRoot.querySelectorAll === 'function') {
        callback(shadowRoot);
      }
    } catch (e) {}
    
    // Check for custom elements that might have internal inputs
    if (element.tagName.includes('-')) {
      try {
        const internals = (element as any).shadowRoot;
        if (internals) {
          callback(internals);
        }
      } catch (e) {}
    }
    
    node = walker.nextNode();
  }
}

// Iframe traversal (same-origin)
function traverseIframes(callback: (doc: Document) => void) {
  document.querySelectorAll('iframe').forEach(iframe => {
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        callback(iframeDoc);
        // Recursively check nested iframes
        iframeDoc.querySelectorAll('iframe').forEach(nestedIframe => {
          try {
            const nestedDoc = nestedIframe.contentDocument || nestedIframe.contentWindow?.document;
            if (nestedDoc) callback(nestedDoc);
          } catch (e) {}
        });
      }
    } catch (e) {
      // Cross-origin iframe, can't access
    }
  });
}

// Workday-specific input detection
function findWorkdayCustomInputs(): Element[] {
  const inputs: Element[] = [];
  
  // Workday uses specific data attributes
  const workdaySelectors = [
    '[data-automation-id="textInputBox"]',
    '[data-automation-id="searchBox"]',
    '[data-automation-id="dateInputBox"]',
    '[data-automation-id="numericInputBox"]',
    '[data-automation-id="richTextArea"]',
    '[data-automation-id="multiselectInputContainer"]',
    '[data-automation-id="selectInputContainer"]',
    '[data-uxi-widget-type="selectinput"]',
    '[data-uxi-widget-type="textinput"]',
    '[data-automation-id*="dropdown"]',
    // Text inputs within Workday containers
    '[data-automation-id] input[type="text"]',
    '[data-automation-id] input:not([type])',
    '[data-automation-id] textarea',
    // ARIA-based inputs
    '[aria-autocomplete]',
    'div[contenteditable="true"][role="textbox"]',
  ];
  
  workdaySelectors.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(el => {
        if (!inputs.includes(el)) inputs.push(el);
      });
    } catch (e) {}
  });
  
  // Find input elements by walking up from labels
  document.querySelectorAll('[data-automation-id*="label"], [data-automation-id*="Label"]').forEach(label => {
    const container = label.closest('[data-automation-id*="formField"]') || 
                     label.closest('[data-automation-id*="section"]') ||
                     label.parentElement?.parentElement;
    if (container) {
      const input = container.querySelector('input, textarea, [role="textbox"], [role="combobox"]');
      if (input && !inputs.includes(input)) {
        inputs.push(input);
      }
    }
  });
  
  return inputs;
}

function extractQuestionText(element: HTMLElement, ats: string | null): string {
  // ATS-specific label extraction
  if (ats === 'workday') {
    const wdLabel = extractWorkdayLabel(element);
    if (wdLabel) return wdLabel;
  }
  
  // Try label[for]
  const id = element.getAttribute('id');
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label) {
      const text = getTextContent(label);
      if (text) return text;
    }
  }

  // Try aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;

  // Try aria-labelledby
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelElement = document.getElementById(labelledBy);
    if (labelElement) {
      const text = getTextContent(labelElement);
      if (text) return text;
    }
  }

  // Try data-automation-id for label (Workday)
  const automationId = element.getAttribute('data-automation-id');
  if (automationId) {
    // Look for matching label
    const labelId = automationId.replace('input', 'label').replace('Input', 'Label');
    const labelEl = document.querySelector(`[data-automation-id="${labelId}"]`);
    if (labelEl) {
      return getTextContent(labelEl);
    }
  }

  // Try placeholder
  const placeholder = (element as HTMLInputElement).placeholder;
  if (placeholder) return placeholder;

  // Try parent label
  let parentElement = element.parentElement;
  while (parentElement && parentElement !== document.body) {
    if (parentElement.tagName.toLowerCase() === 'label') {
      const text = getTextContent(parentElement);
      if (text) return text;
    }
    parentElement = parentElement.parentElement;
  }

  // Try fieldset legend
  const fieldset = element.closest('fieldset');
  if (fieldset) {
    const legend = fieldset.querySelector('legend');
    if (legend) {
      const text = getTextContent(legend);
      if (text) return text;
    }
  }

  // Try preceding text nodes (siblings)
  let prev = element.previousElementSibling;
  let attempts = 0;
  while (prev && attempts < 3) {
    const text = getTextContent(prev);
    if (text && text.length < 200) {
      return text;
    }
    prev = prev.previousElementSibling;
    attempts++;
  }

  // Try parent's text content (first child)
  const parentNode = element.parentElement;
  if (parentNode) {
    const firstChild = parentNode.firstChild;
    if (firstChild && firstChild.nodeType === Node.TEXT_NODE) {
      const text = firstChild.textContent?.trim();
      if (text && text.length < 200) return text;
    }
  }

  return '';
}

// Workday-specific label extraction
function extractWorkdayLabel(element: HTMLElement): string {
  // Method 1: Find label in same form field container
  const formField = element.closest('[data-automation-id*="formField"]') ||
                   element.closest('[data-automation-id*="section"]') ||
                   element.closest('.WM4P') ||
                   element.closest('.WGVO');
  
  if (formField) {
    // Look for label elements
    const labelSelectors = [
      '[data-automation-id*="label"]',
      '[data-automation-id*="Label"]',
      '.gwt-Label',
      '[data-uxi-widget-type="selectinputlabel"]',
      'label',
      '.WEOC',
      '.WE0F',
    ];
    
    for (const selector of labelSelectors) {
      const label = formField.querySelector(selector);
      if (label) {
        const text = getTextContent(label);
        if (text && text.length > 2 && text.length < 300) {
          return text.replace(/\*$/, '').trim(); // Remove required asterisk
        }
      }
    }
  }
  
  // Method 2: Look for preceding siblings
  let sibling = element.previousElementSibling;
  let depth = 0;
  while (sibling && depth < 5) {
    if (sibling.matches('[data-automation-id*="label"], [data-automation-id*="Label"], label, .gwt-Label')) {
      const text = getTextContent(sibling);
      if (text) return text.replace(/\*$/, '').trim();
    }
    sibling = sibling.previousElementSibling;
    depth++;
  }
  
  // Method 3: Look in parent's preceding siblings
  let parent = element.parentElement;
  let parentDepth = 0;
  while (parent && parentDepth < 4) {
    let parentSibling = parent.previousElementSibling;
    while (parentSibling) {
      const text = getTextContent(parentSibling);
      if (text && text.length > 2 && text.length < 200) {
        return text.replace(/\*$/, '').trim();
      }
      parentSibling = parentSibling.previousElementSibling;
    }
    parent = parent.parentElement;
    parentDepth++;
  }
  
  return '';
}

function getLabelText(element: HTMLElement): string | undefined {
  const id = element.getAttribute('id');
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label) return getTextContent(label);
  }
  return undefined;
}

function getTextContent(element: Element): string {
  // Clone element and remove hidden elements before getting text
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll('[hidden], [style*="display: none"], [style*="visibility: hidden"], .sr-only, .visually-hidden').forEach(el => el.remove());
  return clone.textContent?.trim().replace(/\s+/g, ' ') || '';
}

function getInputType(element: HTMLElement): string {
  const tagName = element.tagName.toLowerCase();
  
  if (tagName === 'textarea') return 'textarea';
  if (tagName === 'select') return 'select';
  
  // Check for contenteditable
  if (element.getAttribute('contenteditable') === 'true') return 'textarea';
  
  // Check ARIA roles
  const role = element.getAttribute('role');
  if (role === 'combobox' || role === 'listbox') return 'select';
  if (role === 'textbox') {
    // Check if it's a rich text area
    if (element.getAttribute('aria-multiline') === 'true') return 'textarea';
    return 'text';
  }
  
  const type = (element as HTMLInputElement).type?.toLowerCase() || 'text';
  
  if (type === 'tel') return 'phone';
  if (type === 'email') return 'email';
  if (type === 'file') return 'file';
  if (type === 'radio') return 'radio';
  if (type === 'checkbox') return 'checkbox';
  if (type === 'date') return 'date';
  if (type === 'number') return 'number';
  
  return 'text';
}

function generateSelector(element: HTMLElement): string {
  // Prefer data-automation-id for Workday
  const automationId = element.getAttribute('data-automation-id');
  if (automationId) return `[data-automation-id="${automationId}"]`;
  
  if (element.id) return `#${element.id}`;
  
  const htmlInput = element as HTMLInputElement;
  if (htmlInput.name) return `[name="${htmlInput.name}"]`;
  
  // Generate path-based selector
  const path: string[] = [];
  let current: HTMLElement | null = element;
  
  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector += `#${current.id}`;
      path.unshift(selector);
      break;
    }
    
    // Use data attributes for more reliable selection
    const dataAttr = current.getAttribute('data-automation-id') || 
                    current.getAttribute('data-testid') ||
                    current.getAttribute('data-test');
    if (dataAttr) {
      const attrName = current.hasAttribute('data-automation-id') ? 'data-automation-id' : 
                      current.hasAttribute('data-testid') ? 'data-testid' : 'data-test';
      selector += `[${attrName}="${dataAttr}"]`;
      path.unshift(selector);
      break;
    }
    
    if (current.className) {
      const classes = current.className.split(' ').filter(c => c && !c.match(/^(css-|sc-|styled)/)).slice(0, 2).join('.');
      if (classes) selector += `.${classes}`;
    }
    path.unshift(selector);
    current = current.parentElement;
  }
  
  return path.join(' > ');
}

function isElementVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function isSensitiveField(questionText: string): boolean {
  const lower = questionText.toLowerCase();
  return SENSITIVE_KEYWORDS.some(keyword => lower.includes(keyword));
}

export function generateFormHash(): string {
  // Simple hash based on form structure
  const forms = document.querySelectorAll('form');
  const structure: string[] = [];
  
  forms.forEach(form => {
    const inputs = form.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
      const htmlInput = input as HTMLInputElement;
      const type = htmlInput.type || input.tagName.toLowerCase();
      const name = htmlInput.name || '';
      structure.push(`${type}:${name}`);
    });
  });
  
  // Simple hash (in production, use crypto.subtle.digest)
  let hash = 0;
  const str = structure.join('|');
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return Math.abs(hash).toString(16);
}

// Export ATS detection for use in content script
export { detectATSPlatform };
