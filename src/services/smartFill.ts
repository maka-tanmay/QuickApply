// Smart Fill Service - Advanced form filling features

// ============================================
// 1. COMMON QUESTIONS DATABASE
// Pre-built answers for frequently asked questions
// ============================================

export interface QuestionAnswer {
  patterns: RegExp[];
  answerKey: string; // Key in profile.fields
  defaultAnswer?: string;
  answerType: 'text' | 'select' | 'radio' | 'yesno';
  category: string;
}

export const COMMON_QUESTIONS: QuestionAnswer[] = [
  // Work Authorization
  {
    patterns: [/authorized.*work/i, /legally.*work/i, /eligible.*work/i, /right.*work/i, /permission.*work/i],
    answerKey: 'work_authorized',
    defaultAnswer: 'Yes',
    answerType: 'yesno',
    category: 'Work Authorization'
  },
  {
    patterns: [/visa/i, /sponsorship/i, /sponsor/i, /work.*permit/i, /require.*sponsor/i],
    answerKey: 'sponsorship',
    defaultAnswer: 'No',
    answerType: 'yesno',
    category: 'Work Authorization'
  },
  {
    patterns: [/citizen/i, /citizenship/i, /nationality/i],
    answerKey: 'citizenship',
    answerType: 'text',
    category: 'Work Authorization'
  },
  
  // Age & Legal
  {
    patterns: [/18.*years/i, /18.*age/i, /legal.*age/i, /at.*least.*18/i, /over.*18/i],
    answerKey: 'over_18',
    defaultAnswer: 'Yes',
    answerType: 'yesno',
    category: 'Legal'
  },
  {
    patterns: [/background.*check/i, /consent.*background/i],
    answerKey: 'background_check',
    defaultAnswer: 'Yes',
    answerType: 'yesno',
    category: 'Legal'
  },
  {
    patterns: [/drug.*test/i, /drug.*screen/i],
    answerKey: 'drug_test',
    defaultAnswer: 'Yes',
    answerType: 'yesno',
    category: 'Legal'
  },
  {
    patterns: [/non.*compete/i, /non-compete/i, /compete.*agreement/i],
    answerKey: 'non_compete',
    defaultAnswer: 'No',
    answerType: 'yesno',
    category: 'Legal'
  },
  
  // Work Preferences
  {
    patterns: [/remote/i, /work.*home/i, /wfh/i, /telecommute/i],
    answerKey: 'remote_preference',
    defaultAnswer: 'Yes',
    answerType: 'yesno',
    category: 'Work Preferences'
  },
  {
    patterns: [/in.*office/i, /on.*site/i, /onsite/i, /hybrid/i, /days.*week/i, /office.*days/i],
    answerKey: 'in_office',
    defaultAnswer: 'Yes',
    answerType: 'yesno',
    category: 'Work Preferences'
  },
  {
    patterns: [/relocate/i, /relocation/i, /willing.*move/i, /open.*relocat/i],
    answerKey: 'relocate',
    defaultAnswer: 'Yes',
    answerType: 'yesno',
    category: 'Work Preferences'
  },
  {
    patterns: [/travel/i, /traveling/i, /percentage.*travel/i],
    answerKey: 'travel',
    defaultAnswer: 'Yes',
    answerType: 'yesno',
    category: 'Work Preferences'
  },
  {
    patterns: [/start.*date/i, /when.*start/i, /available.*start/i, /earliest.*start/i, /notice.*period/i],
    answerKey: 'start_date',
    defaultAnswer: 'Immediately',
    answerType: 'text',
    category: 'Work Preferences'
  },
  {
    patterns: [/shift/i, /night.*shift/i, /weekend/i, /flexible.*hours/i, /overtime/i],
    answerKey: 'flexible_hours',
    defaultAnswer: 'Yes',
    answerType: 'yesno',
    category: 'Work Preferences'
  },
  
  // Experience & Skills
  {
    patterns: [/years.*experience/i, /experience.*years/i, /how.*long/i, /total.*experience/i],
    answerKey: 'years_experience',
    answerType: 'text',
    category: 'Experience'
  },
  {
    patterns: [/current.*salary/i, /present.*salary/i, /current.*compensation/i],
    answerKey: 'current_salary',
    answerType: 'text',
    category: 'Compensation'
  },
  {
    patterns: [/expected.*salary/i, /desired.*salary/i, /salary.*expectation/i, /salary.*requirement/i, /compensation.*expectation/i],
    answerKey: 'expected_salary',
    answerType: 'text',
    category: 'Compensation'
  },
  {
    patterns: [/linkedin/i, /linked.*in/i],
    answerKey: 'linkedin_url',
    answerType: 'text',
    category: 'Links'
  },
  {
    patterns: [/portfolio/i, /website/i, /personal.*site/i],
    answerKey: 'portfolio_url',
    answerType: 'text',
    category: 'Links'
  },
  {
    patterns: [/github/i, /git.*hub/i],
    answerKey: 'github_url',
    answerType: 'text',
    category: 'Links'
  },
  
  // Education
  {
    patterns: [/highest.*education/i, /education.*level/i, /degree/i, /qualification/i],
    answerKey: 'education_level',
    answerType: 'select',
    category: 'Education'
  },
  {
    patterns: [/university/i, /college/i, /school.*name/i, /institution/i],
    answerKey: 'university',
    answerType: 'text',
    category: 'Education'
  },
  {
    patterns: [/major/i, /field.*study/i, /specialization/i],
    answerKey: 'major',
    answerType: 'text',
    category: 'Education'
  },
  {
    patterns: [/gpa/i, /grade.*point/i, /cgpa/i],
    answerKey: 'gpa',
    answerType: 'text',
    category: 'Education'
  },
  {
    patterns: [/graduation/i, /graduate.*date/i, /completion.*date/i, /when.*graduate/i],
    answerKey: 'graduation_date',
    answerType: 'text',
    category: 'Education'
  },
  {
    patterns: [/currently.*enrolled/i, /student/i, /still.*studying/i],
    answerKey: 'enrolled',
    defaultAnswer: 'No',
    answerType: 'yesno',
    category: 'Education'
  },
  
  // Demographics (EEO)
  {
    patterns: [/gender/i, /sex/i],
    answerKey: 'gender',
    answerType: 'select',
    category: 'Demographics'
  },
  {
    patterns: [/ethnicity/i, /race/i, /ethnic.*background/i],
    answerKey: 'ethnicity',
    answerType: 'select',
    category: 'Demographics'
  },
  {
    patterns: [/hispanic/i, /latino/i, /latina/i],
    answerKey: 'hispanic',
    answerType: 'yesno',
    category: 'Demographics'
  },
  {
    patterns: [/veteran/i, /military/i, /armed.*forces/i, /served/i],
    answerKey: 'veteran_status',
    answerType: 'select',
    category: 'Demographics'
  },
  {
    patterns: [/disability/i, /disabled/i, /handicap/i],
    answerKey: 'disability',
    answerType: 'select',
    category: 'Demographics'
  },
  {
    patterns: [/lgbtq/i, /sexual.*orientation/i],
    answerKey: 'lgbtq',
    answerType: 'select',
    category: 'Demographics'
  },
  
  // Referral & Source
  {
    patterns: [/hear.*about/i, /how.*find/i, /source/i, /referral/i, /where.*learn/i],
    answerKey: 'referral_source',
    defaultAnswer: 'LinkedIn',
    answerType: 'select',
    category: 'Referral'
  },
  {
    patterns: [/referred.*by/i, /referrer/i, /who.*referred/i, /employee.*referral/i],
    answerKey: 'referrer_name',
    answerType: 'text',
    category: 'Referral'
  },
  
  // Availability
  {
    patterns: [/available.*interview/i, /interview.*availability/i, /when.*interview/i],
    answerKey: 'interview_availability',
    defaultAnswer: 'Available anytime',
    answerType: 'text',
    category: 'Availability'
  },
  {
    patterns: [/full.*time/i, /part.*time/i, /employment.*type/i, /job.*type/i],
    answerKey: 'employment_type',
    defaultAnswer: 'Full-time',
    answerType: 'select',
    category: 'Availability'
  },
  {
    patterns: [/contract/i, /contractor/i, /freelance/i, /w2.*1099/i],
    answerKey: 'contract_preference',
    answerType: 'select',
    category: 'Availability'
  },
];

// ============================================
// 2. SMART FIELD MATCHER
// Match questions to answers using multiple strategies
// ============================================

export function findBestAnswer(
  questionText: string,
  fieldName: string,
  profile: any
): { answer: string; confidence: number; source: string } | null {
  const combined = `${questionText} ${fieldName}`.toLowerCase();
  
  // Strategy 1: Check common questions database
  for (const qa of COMMON_QUESTIONS) {
    for (const pattern of qa.patterns) {
      if (pattern.test(combined)) {
        const answer = profile.fields?.[qa.answerKey] || qa.defaultAnswer;
        if (answer) {
          return {
            answer,
            confidence: 0.95,
            source: `common:${qa.category}`
          };
        }
      }
    }
  }
  
  // Strategy 2: Direct field name match
  const fieldMappings: Record<string, string[]> = {
    'first_name': ['firstname', 'first', 'fname', 'givenname'],
    'last_name': ['lastname', 'last', 'lname', 'surname', 'familyname'],
    'email': ['email', 'e-mail', 'emailaddress'],
    'phone': ['phone', 'mobile', 'cell', 'telephone', 'tel'],
    'location': ['location', 'city', 'address'],
    'country': ['country', 'nation'],
    'current_title': ['title', 'jobtitle', 'currenttitle', 'position'],
    'linkedin_url': ['linkedin', 'linkedinurl', 'linkedinprofile'],
    'portfolio_url': ['portfolio', 'website', 'personalsite'],
    'github_url': ['github', 'githuburl'],
  };
  
  const normalizedField = fieldName.toLowerCase().replace(/[^a-z]/g, '');
  
  for (const [profileKey, aliases] of Object.entries(fieldMappings)) {
    if (aliases.some(a => normalizedField.includes(a) || a.includes(normalizedField))) {
      let value = '';
      
      if (profileKey === 'first_name') {
        value = profile.first_name || profile.name?.split(' ')[0] || '';
      } else if (profileKey === 'last_name') {
        value = profile.last_name || profile.name?.split(' ').slice(1).join(' ') || '';
      } else if (profileKey === 'email') {
        value = profile.email || '';
      } else if (profileKey === 'phone') {
        value = profile.phone || '';
      } else if (profileKey === 'location') {
        value = profile.location || '';
      } else if (profileKey === 'country') {
        value = profile.country || profile.fields?.country || '';
      } else {
        value = profile.fields?.[profileKey] || '';
      }
      
      if (value) {
        return {
          answer: value,
          confidence: 0.9,
          source: `field:${profileKey}`
        };
      }
    }
  }
  
  // Strategy 3: Check custom fields with fuzzy matching
  if (profile.fields) {
    for (const [key, value] of Object.entries(profile.fields)) {
      const keyNorm = key.toLowerCase().replace(/[_-]/g, '');
      if (combined.includes(keyNorm) || keyNorm.split(/(?=[A-Z])/).some(w => combined.includes(w.toLowerCase()))) {
        return {
          answer: value as string,
          confidence: 0.8,
          source: `custom:${key}`
        };
      }
    }
  }
  
  return null;
}

// ============================================
// 3. YES/NO ANSWER NORMALIZER
// Convert various yes/no formats
// ============================================

export function normalizeYesNo(value: string, options: string[]): string | null {
  const valueLower = value.toLowerCase().trim();
  const isYes = ['yes', 'y', 'true', '1', 'yeah', 'yep', 'affirmative'].includes(valueLower);
  const isNo = ['no', 'n', 'false', '0', 'nope', 'negative'].includes(valueLower);
  
  if (!isYes && !isNo) return value; // Not a yes/no value
  
  // Find matching option
  for (const opt of options) {
    const optLower = opt.toLowerCase();
    if (isYes && (optLower.includes('yes') || optLower === 'y' || optLower === 'true')) {
      return opt;
    }
    if (isNo && (optLower.includes('no') || optLower === 'n' || optLower === 'false')) {
      return opt;
    }
  }
  
  return value;
}

// ============================================
// 4. OPEN-ENDED QUESTION TEMPLATES
// Pre-built templates for common essay questions
// ============================================

export interface QuestionTemplate {
  patterns: RegExp[];
  templateKey: string;
  category: string;
}

export const OPEN_ENDED_TEMPLATES: QuestionTemplate[] = [
  {
    patterns: [/why.*interest/i, /why.*apply/i, /why.*this.*role/i, /why.*position/i, /interest.*role/i],
    templateKey: 'why_interested',
    category: 'Motivation'
  },
  {
    patterns: [/why.*company/i, /why.*us/i, /why.*work.*here/i, /why.*join/i],
    templateKey: 'why_company',
    category: 'Motivation'
  },
  {
    patterns: [/tell.*about.*yourself/i, /describe.*yourself/i, /introduce.*yourself/i],
    templateKey: 'about_yourself',
    category: 'Introduction'
  },
  {
    patterns: [/strength/i, /greatest.*strength/i, /top.*strength/i],
    templateKey: 'strengths',
    category: 'Self-Assessment'
  },
  {
    patterns: [/weakness/i, /area.*improve/i, /development.*area/i],
    templateKey: 'weaknesses',
    category: 'Self-Assessment'
  },
  {
    patterns: [/lead.*team/i, /leadership/i, /manage.*team/i, /led.*project/i],
    templateKey: 'leadership',
    category: 'Behavioral'
  },
  {
    patterns: [/challenge/i, /difficult.*situation/i, /obstacle/i, /problem.*solv/i],
    templateKey: 'challenge',
    category: 'Behavioral'
  },
  {
    patterns: [/conflict/i, /disagree/i, /difficult.*colleague/i, /confrontation/i],
    templateKey: 'conflict',
    category: 'Behavioral'
  },
  {
    patterns: [/achievement/i, /accomplishment/i, /proud.*of/i, /success.*story/i],
    templateKey: 'achievement',
    category: 'Behavioral'
  },
  {
    patterns: [/failure/i, /mistake/i, /learned.*from/i, /setback/i],
    templateKey: 'failure',
    category: 'Behavioral'
  },
  {
    patterns: [/5.*years/i, /future/i, /career.*goal/i, /where.*see.*yourself/i],
    templateKey: 'future_goals',
    category: 'Goals'
  },
  {
    patterns: [/additional.*info/i, /anything.*else/i, /like.*add/i, /want.*know/i],
    templateKey: 'additional_info',
    category: 'General'
  },
  {
    patterns: [/cover.*letter/i, /letter.*interest/i, /motivation.*letter/i],
    templateKey: 'cover_letter',
    category: 'Cover Letter'
  },
];

export function findMatchingTemplate(questionText: string): QuestionTemplate | null {
  for (const template of OPEN_ENDED_TEMPLATES) {
    for (const pattern of template.patterns) {
      if (pattern.test(questionText)) {
        return template;
      }
    }
  }
  return null;
}

// ============================================
// 5. FIELD LEARNING SYSTEM
// Remember corrections and learn patterns
// ============================================

export interface LearnedMapping {
  questionPattern: string;
  domain: string;
  fieldKey: string;
  correctAnswer: string;
  uses: number;
  lastUsed: number;
}

export function createQuestionPattern(questionText: string): string {
  // Create a normalized pattern from question text
  return questionText
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w.length > 3)
    .slice(0, 5)
    .join(' ');
}

// ============================================
// 6. CONFIDENCE SCORING
// Calculate how confident we are in an answer
// ============================================

export function calculateConfidence(
  matchType: 'exact' | 'pattern' | 'fuzzy' | 'ai',
  hasValue: boolean,
  fieldType: string
): number {
  let base = 0;
  
  switch (matchType) {
    case 'exact': base = 0.95; break;
    case 'pattern': base = 0.85; break;
    case 'fuzzy': base = 0.7; break;
    case 'ai': base = 0.8; break;
  }
  
  if (!hasValue) base *= 0.5;
  
  // Boost for simple field types
  if (['email', 'phone', 'text'].includes(fieldType)) {
    base = Math.min(base * 1.1, 1);
  }
  
  return Math.round(base * 100) / 100;
}

// ============================================
// 7. BATCH FILL OPTIMIZER
// Group similar fields and fill efficiently
// ============================================

export interface FieldGroup {
  category: string;
  fields: Array<{
    element: HTMLElement;
    label: string;
    suggestedValue: string;
    confidence: number;
  }>;
}

export function groupFieldsByCategory(
  fields: Array<{ element: HTMLElement; label: string; category?: string; value?: string; confidence?: number }>
): FieldGroup[] {
  const groups: Map<string, FieldGroup> = new Map();
  
  for (const field of fields) {
    const category = field.category || 'Other';
    
    if (!groups.has(category)) {
      groups.set(category, { category, fields: [] });
    }
    
    groups.get(category)!.fields.push({
      element: field.element,
      label: field.label,
      suggestedValue: field.value || '',
      confidence: field.confidence || 0
    });
  }
  
  return Array.from(groups.values()).sort((a, b) => {
    const order = ['Personal', 'Contact', 'Work Authorization', 'Experience', 'Education', 'Demographics', 'Other'];
    return order.indexOf(a.category) - order.indexOf(b.category);
  });
}

