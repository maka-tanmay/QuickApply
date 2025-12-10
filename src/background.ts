// Background service worker
console.log('JobRight AI: Background script loaded');

import { 
  matchQuestionToProfile, 
  generateCoverLetterSnippet, 
  answerOpenEndedQuestion,
  improveAnswer,
  generateWhyCompanyAnswer,
  answerBehavioralQuestion
} from './services/aiService.js';

import {
  analyzeJobDescription,
  optimizeResumeForATS,
  generateFullCoverLetter
} from './services/advancedAI.js';

import {
  Application,
  ApplicationStats,
  calculateStats,
  getFollowUpsDue,
  getUpcomingInterviews,
  getSuggestions,
  generateId
} from './services/applicationTracker.js';

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
  resume_text?: string;
  cover_letter_snippets: Array<{ id: string; title: string; text: string }>;
  created_at?: number;
  updated_at?: number;
}

let profiles: UserProfile[] = [];
let applications: Application[] = [];
let settings = {
  enabled: true,
  extensionEnabled: true, // Master on/off toggle
  activeProfileId: null as string | null,
  openrouterApiKey: '',
  perplexityApiKey: '',
  deepseekApiKey: '',
  aiEnabled: false,
  aiProvider: 'openrouter' as 'openrouter' | 'perplexity' | 'deepseek',
  openrouterModel: 'google/gemma-2-9b-it:free',
  perplexityModel: 'sonar',
  deepseekModel: 'deepseek-chat',
  aiModel: 'sonar' // Legacy
};

// Centralized AI API call function
async function callAI(messages: Array<{role: string; content: string}>, maxTokens: number = 2000): Promise<string> {
  const provider = settings.aiProvider || 'openrouter';
  
  let url: string;
  let apiKey: string;
  let model: string;
  let headers: Record<string, string>;
  
  if (provider === 'openrouter') {
    url = 'https://openrouter.ai/api/v1/chat/completions';
    apiKey = settings.openrouterApiKey;
    model = settings.openrouterModel || 'google/gemma-2-9b-it:free';
    headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://jobright-ai.extension',
      'X-Title': 'JobRight AI'
    };
  } else if (provider === 'deepseek') {
    url = 'https://api.deepseek.com/chat/completions';
    apiKey = settings.deepseekApiKey;
    model = settings.deepseekModel || 'deepseek-chat';
    headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
  } else {
    url = 'https://api.perplexity.ai/chat/completions';
    apiKey = settings.perplexityApiKey;
    model = settings.perplexityModel || 'sonar';
    headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
  }
  
  if (!apiKey) {
    throw new Error(`No API key configured for ${provider}. Please add your API key in Options → AI Settings.`);
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${provider} API error: ${errorText}`);
  }
  
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// Check if AI is available
function isAIAvailable(): boolean {
  if (!settings.aiEnabled) return false;
  const provider = settings.aiProvider || 'openrouter';
  if (provider === 'openrouter') {
    return !!settings.openrouterApiKey;
  } else if (provider === 'deepseek') {
    return !!settings.deepseekApiKey;
  }
  return !!settings.perplexityApiKey;
}

// Get current AI provider name
function getAIProviderName(): string {
  const provider = settings.aiProvider || 'openrouter';
  if (provider === 'openrouter') return 'OpenRouter';
  if (provider === 'deepseek') return 'DeepSeek';
  return 'Perplexity';
}

// Get the correct API key for the current provider
function getCurrentApiKey(): string {
  const provider = settings.aiProvider || 'openrouter';
  if (provider === 'openrouter') {
    return settings.openrouterApiKey || '';
  } else if (provider === 'deepseek') {
    return settings.deepseekApiKey || '';
  }
  return settings.perplexityApiKey || '';
}

// Generate open-ended answer using centralized AI call
async function generateOpenEndedAnswer(question: string, profile: any, maxLength: number = 1000): Promise<string> {
  const systemPrompt = `You are an ELITE JOB APPLICATION ASSISTANT helping a candidate present themselves as the BEST POSSIBLE applicant.

## RULES
1. Write in FIRST PERSON as if you ARE the candidate
2. Use specific achievements and examples from their resume
3. Be compelling, confident, and memorable
4. Show genuine enthusiasm for the opportunity
5. Use power words: "led", "achieved", "delivered", "optimized", "grew", "built"
6. Keep answer under ${maxLength} characters but make it COMPLETE
7. DO NOT truncate mid-sentence - finish your thoughts
8. Return ONLY the answer text, no quotes or formatting

## TONE
- Professional yet personable
- Confident and accomplished
- Enthusiastic about the opportunity
- Specific and results-oriented`;

  const profileSummary = buildProfileSummaryForAI(profile);

  const userPrompt = `## QUESTION TO ANSWER
"${question}"

## MY BACKGROUND (Write as if you ARE this person)
${profileSummary}

Write a compelling, COMPLETE answer that would impress a hiring manager. Make sure to finish your answer properly.`;

  try {
    const response = await callAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], 1500); // Generous token limit

    let answer = response.trim();
    // Remove any quotes that might wrap the answer
    if (answer.startsWith('"') && answer.endsWith('"')) {
      answer = answer.slice(1, -1);
    }
    
    return answer;
  } catch (error) {
    console.error('Open-ended answer error:', error);
    return '';
  }
}

// Build profile summary for AI prompts
function buildProfileSummaryForAI(profile: any): string {
  const sections: string[] = [];
  
  // Basic info
  sections.push(`Name: ${profile.name || (profile.first_name + ' ' + profile.last_name)}`);
  if (profile.fields?.current_title) {
    sections.push(`Current Role: ${profile.fields.current_title}`);
  }
  if (profile.fields?.years_experience) {
    sections.push(`Experience: ${profile.fields.years_experience} years`);
  }
  if (profile.location) {
    sections.push(`Location: ${profile.location}`);
  }
  
  // Skills
  if (profile.fields?.skills) {
    sections.push(`\nKey Skills: ${profile.fields.skills}`);
  }
  
  // Resume content (the gold mine!)
  if (profile.resume_text) {
    sections.push(`\n=== FULL RESUME ===\n${profile.resume_text}`);
  }
  
  // Cover letter snippets as additional context
  if (profile.cover_letter_snippets?.length > 0) {
    const snippets = profile.cover_letter_snippets
      .map((s: any) => `${s.title}: ${s.text}`)
      .join('\n');
    sections.push(`\n=== KEY TALKING POINTS ===\n${snippets}`);
  }
  
  // Additional fields
  const importantFields = ['education', 'certifications', 'projects', 'achievements', 'languages'];
  const additionalInfo = Object.entries(profile.fields || {})
    .filter(([key]) => importantFields.some(f => key.toLowerCase().includes(f)))
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  
  if (additionalInfo) {
    sections.push(`\n=== ADDITIONAL INFO ===\n${additionalInfo}`);
  }
  
  return sections.join('\n');
}

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('JobRight AI: Extension installed');
  loadFromStorage();
});

// Load on startup
loadFromStorage();

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('JobRight AI Background: Message:', message.type);
  
  handleMessage(message)
    .then(response => {
      sendResponse(response);
    })
    .catch(error => {
      console.error('JobRight AI Background: Error:', error);
      sendResponse({ error: String(error) });
    });
  
  return true;
});

async function handleMessage(message: any): Promise<any> {
  await loadFromStorage();
  
  switch (message.type) {
    case 'isEnabled':
      return settings.enabled;

    case 'getActiveProfile':
      return settings.activeProfileId;

    case 'setActiveProfile':
      settings.activeProfileId = message.profileId;
      await saveToStorage();
      return { success: true };

    case 'getProfile':
      return profiles.find(p => p.profile_id === message.profileId) || null;

    case 'getAllProfiles':
      return profiles;

    case 'saveProfile': {
      const newProfile: UserProfile = {
        ...message.profile,
        profile_id: message.profile.profile_id || crypto.randomUUID(),
        created_at: message.profile.created_at || Date.now(),
        updated_at: Date.now()
      };
      
      const existingIndex = profiles.findIndex(p => p.profile_id === newProfile.profile_id);
      if (existingIndex >= 0) {
        profiles[existingIndex] = newProfile;
      } else {
        profiles.push(newProfile);
      }
      
      await saveToStorage();
      return { success: true, profile_id: newProfile.profile_id };
    }

    case 'deleteProfile':
      profiles = profiles.filter(p => p.profile_id !== message.profileId);
      if (settings.activeProfileId === message.profileId) {
        settings.activeProfileId = null;
      }
      await saveToStorage();
      return { success: true };

    case 'getSettings':
      return {
        enabled: settings.enabled,
        activeProfileId: settings.activeProfileId,
        aiEnabled: settings.aiEnabled,
        aiProvider: settings.aiProvider || 'openrouter',
        openrouterModel: settings.openrouterModel || 'google/gemma-2-9b-it:free',
        perplexityModel: settings.perplexityModel || 'sonar',
        deepseekModel: settings.deepseekModel || 'deepseek-chat',
        hasOpenRouterKey: !!(settings.openrouterApiKey && settings.openrouterApiKey.length > 0),
        hasPerplexityKey: !!(settings.perplexityApiKey && settings.perplexityApiKey.length > 0),
        hasDeepSeekKey: !!(settings.deepseekApiKey && settings.deepseekApiKey.length > 0),
        // Legacy compatibility
        hasApiKey: !!(settings.openrouterApiKey && settings.openrouterApiKey.length > 0) || 
                   !!(settings.perplexityApiKey && settings.perplexityApiKey.length > 0) || 
                   !!(settings.deepseekApiKey && settings.deepseekApiKey.length > 0),
        aiModel: settings.perplexityModel || settings.aiModel
      };

    case 'updateSettings':
      console.log('JobRight AI: Updating settings:', Object.keys(message.settings));
      
      if (message.settings.enabled !== undefined) {
        settings.enabled = message.settings.enabled;
      }
      if (message.settings.extensionEnabled !== undefined) {
        settings.extensionEnabled = message.settings.extensionEnabled;
      }
      if (message.settings.activeProfileId !== undefined) {
        settings.activeProfileId = message.settings.activeProfileId;
      }
      // API Keys - update if provided (even if empty, to allow clearing)
      // Only update if explicitly provided in the message
      if (message.settings.openrouterApiKey !== undefined) {
        const trimmed = message.settings.openrouterApiKey.trim();
        if (trimmed !== '' && !trimmed.includes('•')) {
          settings.openrouterApiKey = trimmed;
          console.log('JobRight AI: Saved OpenRouter API key (length:', settings.openrouterApiKey.length, ')');
        } else if (trimmed === '') {
          // Allow clearing the key if explicitly set to empty
          settings.openrouterApiKey = '';
          console.log('JobRight AI: Cleared OpenRouter API key');
        }
      }
      if (message.settings.perplexityApiKey !== undefined) {
        const trimmed = message.settings.perplexityApiKey.trim();
        if (trimmed !== '' && !trimmed.includes('•')) {
          settings.perplexityApiKey = trimmed;
          console.log('JobRight AI: Saved Perplexity API key (length:', settings.perplexityApiKey.length, ')');
        } else if (trimmed === '') {
          settings.perplexityApiKey = '';
          console.log('JobRight AI: Cleared Perplexity API key');
        }
      }
      if (message.settings.deepseekApiKey !== undefined) {
        const trimmed = message.settings.deepseekApiKey.trim();
        if (trimmed !== '' && !trimmed.includes('•')) {
          settings.deepseekApiKey = trimmed;
          console.log('JobRight AI: Saved DeepSeek API key (length:', settings.deepseekApiKey.length, ')');
        } else if (trimmed === '') {
          settings.deepseekApiKey = '';
          console.log('JobRight AI: Cleared DeepSeek API key');
        }
      }
      if (message.settings.aiEnabled !== undefined) {
        settings.aiEnabled = message.settings.aiEnabled;
      }
      if (message.settings.aiProvider !== undefined) {
        settings.aiProvider = message.settings.aiProvider;
      }
      if (message.settings.openrouterModel !== undefined) {
        settings.openrouterModel = message.settings.openrouterModel;
      }
      if (message.settings.perplexityModel !== undefined) {
        settings.perplexityModel = message.settings.perplexityModel;
      }
      if (message.settings.deepseekModel !== undefined) {
        settings.deepseekModel = message.settings.deepseekModel;
      }
      // Legacy compatibility
      if (message.settings.aiModel !== undefined) {
        settings.aiModel = message.settings.aiModel;
      }
      
      // Always save to storage after updating
      await saveToStorage();
      console.log('JobRight AI: Settings saved. AI enabled:', settings.aiEnabled, 'Provider:', settings.aiProvider, 'Has keys:', {
        openrouter: !!settings.openrouterApiKey,
        perplexity: !!settings.perplexityApiKey,
        deepseek: !!settings.deepseekApiKey
      });
      return { success: true };

    // Open options page
    case 'openOptions':
      chrome.runtime.openOptionsPage();
      return { success: true };

    // Save learned mapping from user corrections
    case 'saveLearnedMapping': {
      const learnedMappings = await getFromStorage('learnedMappings') || [];
      const existing = learnedMappings.findIndex(
        (m: any) => m.domain === message.mapping.domain && m.pattern === message.mapping.pattern
      );
      if (existing >= 0) {
        learnedMappings[existing] = message.mapping;
      } else {
        learnedMappings.push(message.mapping);
      }
      // Keep only last 500 mappings
      if (learnedMappings.length > 500) {
        learnedMappings.splice(0, learnedMappings.length - 500);
      }
      await chrome.storage.local.set({ learnedMappings });
      return { success: true };
    }

    // Get learned mappings
    case 'getLearnedMappings': {
      const mappings = await getFromStorage('learnedMappings') || [];
      return mappings.filter((m: any) => m.domain === message.domain);
    }

    // Parse resume text and extract fields
    case 'parseResume': {
      if (!isAIAvailable()) {
        return { error: `AI not enabled. Please add your ${getAIProviderName()} API key in Options → AI Settings.` };
      }
      
      const resumeText = message.resumeText;
      const prompt = `You are a resume parser. Extract structured information from this resume.

Resume:
${resumeText}

Extract and return a JSON object with these fields (use null if not found):
{
  "first_name": "...",
  "last_name": "...",
  "email": "...",
  "phone": "...",
  "location": "...",
  "current_title": "...",
  "years_experience": "...",
  "education_level": "...",
  "university": "...",
  "major": "...",
  "gpa": "...",
  "skills": "...",
  "linkedin_url": "...",
  "github_url": "...",
  "portfolio_url": "..."
}

Return ONLY the JSON object, no other text.`;

      try {
        const content = await callAI([{ role: 'user', content: prompt }], 1000);
        
        // Extract JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return { success: true, data: parsed };
        }
        
        return { error: 'Could not parse resume' };
      } catch (error) {
        return { error: String(error) };
      }
    }

    // AI-powered features
    case 'aiMatch': {
      if (!isAIAvailable()) {
        return { error: `AI not enabled. Please configure ${getAIProviderName()} API key.` };
      }
      
      const profile = profiles.find(p => p.profile_id === settings.activeProfileId);
      if (!profile) {
        return { error: 'No active profile' };
      }
      
      const result = await matchQuestionToProfile(
        message.question,
        message.inputType,
        message.options || [],
        profile,
        getCurrentApiKey()
      );
      
      return result || { error: 'No match found' };
    }

    case 'aiGenerateCoverLetter': {
      if (!isAIAvailable()) {
        return { error: `AI not enabled. Please configure ${getAIProviderName()} API key.` };
      }
      
      const profile = profiles.find(p => p.profile_id === settings.activeProfileId);
      if (!profile) {
        return { error: 'No active profile' };
      }
      
      const snippet = await generateCoverLetterSnippet(
        message.jobTitle,
        message.companyName,
        message.requirements || [],
        profile,
        getCurrentApiKey()
      );
      
      return { snippet };
    }

    case 'aiAnswerQuestion': {
      if (!isAIAvailable()) {
        return { error: `AI not enabled. Configure ${getAIProviderName()} API key in Options.` };
      }
      
      const profile = profiles.find(p => p.profile_id === settings.activeProfileId);
      if (!profile) {
        return { error: 'No active profile' };
      }
      
      // Use centralized AI call for all providers
      const maxLength = message.maxLength || 1000;
      const answer = await generateOpenEndedAnswer(message.question, profile, maxLength);
      
      return { answer };
    }

    case 'aiImproveAnswer': {
      if (!isAIAvailable()) {
        return { error: `AI not enabled. Configure ${getAIProviderName()} API key in Options.` };
      }
      
      const profile = profiles.find(p => p.profile_id === settings.activeProfileId);
      if (!profile) {
        return { error: 'No active profile' };
      }
      
      const improved = await improveAnswer(
        message.question,
        message.currentAnswer,
        profile,
        getCurrentApiKey()
      );
      
      return { answer: improved };
    }

    case 'aiWhyCompany': {
      if (!isAIAvailable()) {
        return { error: `AI not enabled. Configure ${getAIProviderName()} API key in Options.` };
      }
      
      const profile = profiles.find(p => p.profile_id === settings.activeProfileId);
      if (!profile) {
        return { error: 'No active profile' };
      }
      
      const answer = await generateWhyCompanyAnswer(
        message.companyName,
        message.jobTitle,
        profile,
        getCurrentApiKey()
      );
      
      return { answer };
    }

    case 'aiBehavioral': {
      if (!isAIAvailable()) {
        return { error: `AI not enabled. Configure ${getAIProviderName()} API key in Options.` };
      }
      
      const profile = profiles.find(p => p.profile_id === settings.activeProfileId);
      if (!profile) {
        return { error: 'No active profile' };
      }
      
      const answer = await answerBehavioralQuestion(
        message.question,
        profile,
        getCurrentApiKey()
      );
      
      return { answer };
    }

    case 'testApiKey': {
      try {
        const provider = message.provider || 'openrouter';
        let url: string;
        let body: any;
        let headers: Record<string, string> = {
          'Authorization': `Bearer ${message.apiKey}`,
          'Content-Type': 'application/json',
        };
        
        if (provider === 'openrouter') {
          // Use OpenRouter's models endpoint to validate key (simpler test)
          const testResponse = await fetch('https://openrouter.ai/api/v1/models', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${message.apiKey}`,
            },
          });
          
          if (testResponse.ok) {
            return { success: true };
          } else {
            const errorText = await testResponse.text();
            return { success: false, error: `Status ${testResponse.status}: ${errorText.substring(0, 200)}` };
          }
        } else if (provider === 'deepseek') {
          url = 'https://api.deepseek.com/chat/completions';
          body = {
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 10,
          };
        } else {
          url = 'https://api.perplexity.ai/chat/completions';
          body = {
            model: 'sonar',
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 10,
          };
        }
        
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });
        
        if (response.ok) {
          return { success: true };
        } else {
          const error = await response.text();
          return { success: false, error };
        }
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }

    // ============================================
    // APPLICATION TRACKER
    // ============================================
    case 'getApplications':
      return applications;

    case 'saveApplication': {
      const app: Application = {
        ...message.application,
        id: message.application.id || generateId(),
        updatedAt: Date.now()
      };
      
      const existingIdx = applications.findIndex(a => a.id === app.id);
      if (existingIdx >= 0) {
        applications[existingIdx] = app;
      } else {
        app.appliedAt = app.appliedAt || Date.now();
        applications.push(app);
      }
      
      await saveToStorage();
      return { success: true, id: app.id };
    }

    case 'deleteApplication':
      applications = applications.filter(a => a.id !== message.id);
      await saveToStorage();
      return { success: true };

    case 'getApplicationStats':
      return calculateStats(applications);

    case 'getFollowUpsDue':
      return getFollowUpsDue(applications);

    case 'getUpcomingInterviews':
      return getUpcomingInterviews(applications);

    case 'getApplicationSuggestions':
      return getSuggestions(applications);

    // ============================================
    // ADVANCED AI FEATURES
    // ============================================
    case 'analyzeJob': {
      if (!isAIAvailable()) {
        return { error: `AI not enabled. Configure ${getAIProviderName()} API key in Options.` };
      }
      const profile = profiles.find(p => p.profile_id === settings.activeProfileId);
      return await analyzeJobDescription(message.jobDescription, profile || {}, getCurrentApiKey());
    }

    case 'optimizeResume': {
      if (!isAIAvailable()) {
        return { error: `AI not enabled. Configure ${getAIProviderName()} API key in Options.` };
      }
      const profile = profiles.find(p => p.profile_id === settings.activeProfileId);
      return await optimizeResumeForATS(
        profile?.resume_text || '',
        message.jobDescription,
        getCurrentApiKey()
      );
    }

    // Cover Letter Generation
    case 'generateCoverLetter': {
      if (!isAIAvailable()) {
        return { error: `AI not enabled. Configure ${getAIProviderName()} API key in Options → AI Settings.` };
      }
      
      const profile = profiles.find(p => p.profile_id === settings.activeProfileId);
      if (!profile) {
        return { error: 'No active profile selected.' };
      }
      
      // Get learning data (consistent key with content.ts)
      const learningResult = await chrome.storage.local.get('coverLetterLearning');
      const learningData = learningResult.coverLetterLearning || null;
      
      const coverLetter = await generateCoverLetter(
        message.jobDescription,
        message.companyName,
        message.jobTitle,
        profile,
        getCurrentApiKey(),
        learningData
      );
      
      return { coverLetter };
    }

    case 'improveCoverLetter': {
      if (!isAIAvailable()) {
        return { error: `AI not enabled. Configure ${getAIProviderName()} API key in Options.` };
      }
      
      const improved = await improveCoverLetter(
        message.coverLetter,
        message.jobDescription,
        getCurrentApiKey(),
        message.customInstructions || ''
      );
      
      return { coverLetter: improved };
    }

    case 'shortenCoverLetter': {
      if (!isAIAvailable()) {
        return { error: `AI not enabled. Configure ${getAIProviderName()} API key in Options.` };
      }
      
      const shortened = await shortenCoverLetter(
        message.coverLetter,
        getCurrentApiKey()
      );
      
      return { coverLetter: shortened };
    }

    default:
      return { error: 'Unknown message type: ' + message.type };
  }
}

// Generate cover letter using AI
async function generateCoverLetter(
  jobDescription: string,
  companyName: string,
  jobTitle: string,
  profile: any,
  apiKey: string,
  learningData: any = null
): Promise<string> {
  const candidateName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || '[Your Name]';
  const currentDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const location = profile.location || '[City, State]';
  const phone = profile.phone || '[Phone]';
  const email = profile.email || '[Email]';
  const linkedin = profile.fields?.linkedin_url || '';
  
  // Format LinkedIn for display
  const linkedinDisplay = linkedin ? `Linkedin - ${linkedin}` : '';
  
  // Build learning context
  let learningContext = '';
  if (learningData) {
    learningContext = `\n## 🎓 PERSONALIZATION DATA (Adapt to user's style)\n`;
    
    // Add previous cover letter examples
    if (learningData.coverLetterExamples && learningData.coverLetterExamples.length > 0) {
      const recentExamples = learningData.coverLetterExamples.slice(0, 2);
      learningContext += `\n### User's Previous Cover Letters (${learningData.coverLetterExamples.length} total)\n`;
      learningContext += `Study their writing style, tone, and structure:\n\n`;
      
      recentExamples.forEach((ex: any, i: number) => {
        learningContext += `**Example ${i + 1}** (${ex.company} - ${ex.jobTitle}):\n`;
        learningContext += `${ex.content.substring(0, 1200)}\n\n`;
      });
    }
    
    // Add user's preferred action verbs
    if (learningData.actionVerbs && learningData.actionVerbs.length > 0) {
      const topVerbs = learningData.actionVerbs.slice(0, 10);
      learningContext += `\n### User's Favorite Action Verbs\n`;
      learningContext += `Use these verbs the user prefers: ${topVerbs.map((v: any) => v.verb).join(', ')}\n`;
    }
    
    // Add opening hook patterns
    if (learningData.openingHooks && learningData.openingHooks.length > 0) {
      learningContext += `\n### User's Opening Hook Style\n`;
      learningContext += `The user opens cover letters like this:\n`;
      learningData.openingHooks.slice(0, 2).forEach((h: any) => {
        learningContext += `• "${h.text.substring(0, 150)}..."\n`;
      });
    }
    
    // Add preferred phrases
    if (learningData.preferredPhrases && learningData.preferredPhrases.length > 0) {
      const topPhrases = learningData.preferredPhrases
        .filter((p: any) => p.count >= 2)
        .slice(0, 8);
      
      if (topPhrases.length > 0) {
        learningContext += `\n### User's Signature Phrases (Used multiple times)\n`;
        topPhrases.forEach((p: any) => {
          learningContext += `• "${p.phrase.substring(0, 80)}..." (×${p.count})\n`;
        });
      }
    }
    
    // Add tone preference
    if (learningData.tonePreferences) {
      const formal = learningData.tonePreferences.formal || 0;
      const conversational = learningData.tonePreferences.conversational || 0;
      if (formal > conversational) {
        learningContext += `\n### Tone Preference: FORMAL\n`;
        learningContext += `The user prefers a formal, professional tone. Use sophisticated vocabulary.\n`;
      } else if (conversational > formal) {
        learningContext += `\n### Tone Preference: CONVERSATIONAL\n`;
        learningContext += `The user prefers a warm, approachable tone. Be personable and enthusiastic.\n`;
      }
    }
    
    learningContext += `\n**⚠️ IMPORTANT:** Match the user's established writing voice, phrase patterns, and preferred action verbs from above.\n`;
  }
  
  const prompt = `You are a WORLD-CLASS cover letter strategist. Your cover letters have a 85% interview callback rate. Generate a cover letter that will make the hiring manager STOP and pay attention.

## 🎯 TARGET POSITION
**Company:** ${companyName}
**Role:** ${jobTitle}
**Job Description:**
${jobDescription.substring(0, 3000)}

## 👤 CANDIDATE PROFILE
**Name:** ${candidateName}
**Email:** ${email}
**Phone:** ${phone}
**Location:** ${location}
**Current Title:** ${profile.fields?.current_title || 'Professional'}
**Experience:** ${profile.fields?.years_experience || 'Experienced'} years
**Technical Skills:** ${profile.fields?.skills || ''}
**Education:** ${profile.fields?.education_level || ''} ${profile.fields?.major ? 'in ' + profile.fields.major : ''} ${profile.fields?.university ? 'from ' + profile.fields.university : ''}
**LinkedIn:** ${linkedin}

${profile.resume_text ? `## 📄 RESUME (PRIMARY SOURCE - Extract real achievements from here)
${profile.resume_text.substring(0, 2500)}` : ''}

${learningContext}

## 🏆 COVER LETTER WRITING STRATEGIES

### OPENING HOOK (First 2 sentences = Most Important)
Create immediate impact with ONE of these patterns:
- **Achievement Lead:** Start with your most impressive, relevant accomplishment with metrics
- **Insight Lead:** Show you understand their business challenge and can solve it
- **Connection Lead:** Reference something specific about the company that genuinely excites you

Example hooks:
• "Having driven 40% revenue growth through data-driven marketing at [Company], I was thrilled to discover [Company]'s commitment to analytics-first decision making."
• "The challenge of scaling [Product] to enterprise customers immediately resonated with me – it's exactly the type of complex sale I've mastered over my 8-year career."

### BODY PARAGRAPHS - The STAR+ Method
For each achievement, include:
- **Situation/Challenge:** What problem existed?
- **Task:** What was your specific responsibility?
- **Action:** What did YOU do (use powerful verbs)?
- **Result:** What was the measurable outcome?
- **Relevance:** Why does this matter for THIS role?

### POWER VERBS (Use these instead of weak alternatives)
Spearheaded, Orchestrated, Championed, Architected, Pioneered, Accelerated, Transformed, Optimized, Scaled, Delivered, Launched, Built, Led, Drove, Increased, Reduced

### SENTENCE VARIETY (Critical for readability)
- Vary your sentence starters - NOT every sentence should start with "I"
- Mix short punchy sentences with longer explanatory ones
- Use transitions: "Building on this success...", "Moreover...", "What particularly excites me..."

### AUTHENTICITY SIGNALS
- Reference specific products, initiatives, or news about ${companyName}
- Connect your career trajectory to their mission
- Show genuine enthusiasm without sounding desperate

## 🧠 CREATIVE INFERENCE (VERY IMPORTANT)
When the resume/profile lacks specific achievements that match job requirements, YOU MUST intelligently infer and create plausible achievements based on:

### Inference Rules:
1. **From Job Titles**: If someone was a "Software Engineer", they likely:
   - Wrote and reviewed code, participated in code reviews
   - Collaborated with cross-functional teams
   - Debugged and optimized applications
   - Participated in agile/scrum processes

2. **From Skills Listed**: If they know "Python", they likely:
   - Built automation scripts that saved time
   - Developed data processing pipelines
   - Created tools used by their team

3. **From Years of Experience**: ${profile.fields?.years_experience || 'Several'} years means:
   - They've likely mentored junior team members
   - Led projects or initiatives
   - Improved processes in their role

4. **From Education**: A degree in ${profile.fields?.major || 'their field'} suggests:
   - Academic projects that demonstrate skills
   - Relevant coursework and knowledge foundations
   - Problem-solving and analytical abilities

### When Inferring, ALWAYS:
- Make achievements SPECIFIC with realistic metrics (e.g., "reduced processing time by 35%", "managed team of 4-6 engineers")
- Connect to their ACTUAL job titles and companies from the resume
- Keep it BELIEVABLE for their experience level
- Frame as reasonable accomplishments for someone in their role

### Examples of Good Inferences:
- Resume says "Data Analyst at TechCorp" → Infer: "Developed automated reporting dashboards that reduced manual reporting time by 40%, enabling the leadership team to make faster data-driven decisions"
- Resume says "Marketing Coordinator" → Infer: "Orchestrated multi-channel campaigns reaching 50K+ customers, contributing to a 25% increase in lead generation"
- Resume lists "SQL, Python" skills → Infer: "Built data pipelines processing 100K+ records daily, improving data accuracy by 30%"

## 📋 EXACT OUTPUT FORMAT

${candidateName}


${location} · ${phone}
${email}${linkedinDisplay ? ` · ${linkedinDisplay}` : ''}

${currentDate}

Dear Team,

[PARAGRAPH 1: THE HOOK - 2-3 sentences]
Open with your strongest, most relevant achievement. If none exists in resume, INFER one based on their job title/skills that matches the job requirements. Show immediate value.

[PARAGRAPH 2: PROOF OF EXCELLENCE - 3-4 sentences]  
2-3 specific achievements with metrics. Use achievements from resume when available. When not available, INTELLIGENTLY INFER plausible achievements based on their roles, skills, and experience level. Make them specific and quantified.

[PARAGRAPH 3: WHY THIS COMPANY - 2-3 sentences]
Show you researched ${companyName}. Connect your goals to their mission. Demonstrate genuine interest, not generic statements.

[PARAGRAPH 4: THE CLOSE - 2 sentences]
Confident summary of your value proposition. Enthusiasm for next steps.

Sincerely,

${candidateName}

## ⚠️ MANDATORY RULES
1. FORMAT: Start with name alone, then blank line, then contact info with · separators
2. SALUTATION: Use "Dear Team," (NOT "Dear Hiring Manager")
3. LENGTH: Body should be 250-350 words total
4. **METRICS ARE REQUIRED**: EVERY achievement MUST have a specific number (%, $, time, team size). If resume doesn't have metrics, INFER realistic ones.
5. **INFERENCE IS REQUIRED**: If resume lacks achievements matching job requirements, CREATE plausible ones based on job titles and skills.
6. NO CLICHÉS: Avoid "team player", "hard worker", "passionate about", "I believe", "I think"
7. NO I-OVERLOAD: Maximum 3 sentences in a row can start with "I"
8. KEYWORDS: Naturally incorporate 4-6 keywords from the job description
9. ENDING: "Sincerely," then blank line, then name
10. **BE SPECIFIC**: Never write vague statements. "Improved processes" → "Improved deployment processes, reducing release time by 40%"

## OUTPUT
Return ONLY the cover letter text. No explanations, no markdown formatting, no headers like "Here's your cover letter:". Just the cover letter itself.`;

  try {
    const content = await callAI([{ role: 'user', content: prompt }], 1500);
    return content || 'Failed to generate cover letter.';
  } catch (error) {
    console.error('Cover letter generation error:', error);
    throw error;
  }
}

// Improve existing cover letter
async function improveCoverLetter(
  coverLetter: string,
  jobDescription: string,
  apiKey: string,
  customInstructions: string = ''
): Promise<string> {
  // Get learning data to understand user's style
  const learningResult = await chrome.storage.local.get('coverLetterLearning');
  const learningData = learningResult.coverLetterLearning || {};
  
  // Build learning context from user's previous letters
  let styleContext = '';
  if (learningData.coverLetterExamples && learningData.coverLetterExamples.length > 0) {
    const recentExamples = learningData.coverLetterExamples.slice(0, 2);
    styleContext = `
## 📚 USER'S WRITING STYLE (Learn from these examples)
The user has written ${learningData.coverLetterExamples.length} cover letters. Match their style:

${recentExamples.map((ex: any, i: number) => `--- Example ${i + 1} ---
${ex.content.substring(0, 800)}
`).join('\n')}
`;
  }

  // Extract preferred phrases
  let phrasesContext = '';
  if (learningData.preferredPhrases && learningData.preferredPhrases.length > 0) {
    const topPhrases = learningData.preferredPhrases
      .filter((p: any) => p.count >= 2)
      .slice(0, 8);
    if (topPhrases.length > 0) {
      phrasesContext = `
## 🎯 USER'S PREFERRED PHRASES (Incorporate naturally)
${topPhrases.map((p: any) => `• "${p.phrase.substring(0, 80)}..."`).join('\n')}
`;
    }
  }

  const prompt = `You are a WORLD-CLASS cover letter strategist who has helped candidates land roles at top companies. Your improvements lead to 3x more interview callbacks.

## 📄 CURRENT COVER LETTER TO IMPROVE:
${coverLetter}

## 📋 TARGET JOB DESCRIPTION:
${jobDescription.substring(0, 2500)}
${styleContext}${phrasesContext}
${customInstructions ? `
## ⭐ USER'S SPECIFIC INSTRUCTIONS - HIGHEST PRIORITY:
"${customInstructions}"

YOU MUST apply these instructions FIRST. This is what the user explicitly asked for. Every single instruction should be addressed in your improvements.
` : ''}

## 🔥 ADVANCED IMPROVEMENT STRATEGIES:

### 1. HOOK ENGINEERING (First 2 sentences are CRITICAL)
- Open with a POWER STATEMENT: achievement, metric, or unique insight
- Create immediate relevance to THIS specific role
- Make them want to keep reading
- Examples of strong hooks:
  • "Having scaled a $2M marketing pipeline to $12M in 18 months, I'm excited to bring this growth mindset to [Company]."
  • "As someone who reduced deployment time by 70% at [Previous Company], the engineering challenges at [Company] immediately resonated with me."

### 2. STRATEGIC KEYWORD INTEGRATION
- Extract exact phrases from job description
- Weave them naturally into achievements
- Mirror their terminology (if they say "cross-functional", use "cross-functional")

### 3. ACHIEVEMENT AMPLIFICATION (CAR+ Method)
Transform weak statements into powerful narratives:
❌ "Managed a team and improved sales"
✅ "Led a 12-person sales team to 140% quota attainment ($4.2M), implementing a consultative selling approach that increased average deal size by 35%"

### 4. EMOTIONAL INTELLIGENCE
- Show genuine knowledge about the company's mission/product
- Connect your values to their values
- Demonstrate you're not just qualified, but EXCITED

### 5. LANGUAGE UPGRADES
Replace weak → strong:
- "helped with" → "spearheaded", "drove", "orchestrated"
- "worked on" → "engineered", "architected", "delivered"
- "was responsible for" → "owned", "led", "managed"
- "I am a team player" → [DELETE - show, don't tell]
- "I think I would be" → "I am confident that" or "I will"

### 6. RHYTHM & FLOW
- Vary sentence length: Short punch. Then longer, more detailed explanation.
- Start sentences with different words (not always "I")
- Use power transitions: "Moreover", "Building on this", "What excites me most"

### 7. CLOSING THAT CONVERTS
- Restate unique value proposition
- Express specific enthusiasm about the opportunity
- Confident call to action without being pushy

## 🧠 ALWAYS DO THIS (AUTOMATIC ENHANCEMENT):
For EVERY improvement, you MUST:

1. **Add specific metrics to ALL vague statements:**
   - "improved efficiency" → "improved efficiency by 35%"
   - "managed team" → "managed a team of 6 engineers"
   - "increased sales" → "increased sales by $250K annually"

2. **Expand generic claims with specifics:**
   - "led projects" → "led 3 cross-functional initiatives involving 8+ stakeholders"
   - "worked with data" → "analyzed 100K+ records daily to drive business decisions"

3. **Infer complementary achievements based on role:**
   - Developer → code reviews, performance optimization, mentoring
   - Manager → process improvements, team development, stakeholder management
   - Analyst → reporting automation, data-driven recommendations, dashboard creation

4. **Bridge to job requirements:**
   - Match their language and requirements
   - Infer relevant experiences they would have had

## ⚠️ RULES:
1. ${customInstructions ? 'USER\'S INSTRUCTIONS ARE TOP PRIORITY - apply them first' : 'Improve ALL aspects systematically'}
2. ALWAYS add metrics and specifics - this is mandatory, not optional
3. Keep it believable for their experience level
4. Keep contact info, dates, and formatting exactly the same
5. Every achievement should have a number (%, $, time saved, team size, etc.)

## OUTPUT:
Return ONLY the improved cover letter. No explanations, no markdown, no "Here's the improved version". Just the cover letter text.`;

  try {
    const content = await callAI([{ role: 'user', content: prompt }], 2000);
    return content || coverLetter;
  } catch (error) {
    console.error('Cover letter improvement error:', error);
    throw error; // Propagate error for better user feedback
  }
}

// Shorten cover letter intelligently
async function shortenCoverLetter(
  coverLetter: string,
  apiKey: string
): Promise<string> {
  const prompt = `You are an expert editor. Shorten this cover letter while MAXIMIZING impact per word.

## CURRENT COVER LETTER:
${coverLetter}

## SHORTENING STRATEGY:
1. **Kill redundancy** - Remove phrases that repeat the same idea
2. **Eliminate filler** - Cut "In addition", "Additionally", "Furthermore" when not needed
3. **Combine sentences** - Merge related ideas
4. **Remove weak qualifiers** - Cut "very", "really", "quite", "somewhat"
5. **Tighten achievements** - Keep the metric, cut the setup
6. **Keep hooks intact** - Opening and closing are sacred

## WHAT TO PRESERVE:
- All specific metrics and achievements
- The opening hook
- Company-specific references
- The confident closing
- Core structure (4 paragraphs)

## WHAT TO CUT:
- Transitional phrases that don't add value
- Repetitive points
- Generic statements
- Overly elaborate explanations

## TARGET:
- Reduce by 25-35% while increasing impact density
- Aim for 200-280 words body text
- Every sentence should earn its place

## OUTPUT:
Return ONLY the shortened cover letter. Keep exact same format (name, contact, date, greeting, body, signature). No explanations.`;

  try {
    const content = await callAI([{ role: 'user', content: prompt }], 1200);
    return content || coverLetter;
  } catch (error) {
    console.error('Cover letter shortening error:', error);
    throw error;
  }
}

async function saveToStorage() {
  try {
    // Ensure all settings fields are included - preserve API keys as-is
    const settingsToSave = {
      enabled: settings.enabled,
      extensionEnabled: settings.extensionEnabled,
      activeProfileId: settings.activeProfileId,
      // Save API keys exactly as they are (don't convert to empty string)
      openrouterApiKey: settings.openrouterApiKey,
      perplexityApiKey: settings.perplexityApiKey,
      deepseekApiKey: settings.deepseekApiKey,
      aiEnabled: settings.aiEnabled,
      aiProvider: settings.aiProvider,
      openrouterModel: settings.openrouterModel,
      perplexityModel: settings.perplexityModel,
      deepseekModel: settings.deepseekModel,
      aiModel: settings.aiModel
    };
    
    await chrome.storage.local.set({ 
      profiles, 
      settings: settingsToSave, 
      applications 
    });
    console.log('JobRight AI: Saved', profiles.length, 'profiles,', applications.length, 'applications');
    console.log('JobRight AI: Settings saved - AI:', settingsToSave.aiEnabled, 'Provider:', settingsToSave.aiProvider, 'Keys present:', {
      openrouter: !!settingsToSave.openrouterApiKey && settingsToSave.openrouterApiKey.length > 0,
      perplexity: !!settingsToSave.perplexityApiKey && settingsToSave.perplexityApiKey.length > 0,
      deepseek: !!settingsToSave.deepseekApiKey && settingsToSave.deepseekApiKey.length > 0
    });
  } catch (error) {
    console.error('JobRight AI: Save error:', error);
  }
}

async function getFromStorage(key: string): Promise<any> {
  const result = await chrome.storage.local.get(key);
  return result[key];
}

async function loadFromStorage() {
  try {
    const data = await chrome.storage.local.get(['profiles', 'settings', 'applications']);
    if (data.profiles) profiles = data.profiles;
    if (data.settings) {
      // Merge settings properly - saved values take precedence
      // Preserve API keys from storage (they may be empty strings, which is valid)
      const savedOpenRouter = data.settings.openrouterApiKey;
      const savedPerplexity = data.settings.perplexityApiKey;
      const savedDeepSeek = data.settings.deepseekApiKey;
      
      settings = {
        ...settings,
        ...data.settings,
        // Always use saved API keys if they exist in storage (even if empty string)
        openrouterApiKey: savedOpenRouter !== undefined ? savedOpenRouter : settings.openrouterApiKey,
        perplexityApiKey: savedPerplexity !== undefined ? savedPerplexity : settings.perplexityApiKey,
        deepseekApiKey: savedDeepSeek !== undefined ? savedDeepSeek : settings.deepseekApiKey,
      };
    }
    if (data.applications) applications = data.applications;
    console.log('JobRight AI: Loaded', profiles.length, 'profiles,', applications.length, 'applications');
    console.log('JobRight AI: Settings loaded - AI enabled:', settings.aiEnabled, 'Provider:', settings.aiProvider, 'Has keys:', {
      openrouter: !!settings.openrouterApiKey && settings.openrouterApiKey.length > 0,
      perplexity: !!settings.perplexityApiKey && settings.perplexityApiKey.length > 0,
      deepseek: !!settings.deepseekApiKey && settings.deepseekApiKey.length > 0
    });
  } catch (error) {
    console.error('JobRight AI: Load error:', error);
  }
}
