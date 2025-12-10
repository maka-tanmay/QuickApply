// AI matching service using LLM prompts

import { UserProfile, FillSuggestion, DetectedField, ContextSnippet, FormMapping, FieldMapping } from '../types.js';
import { isSensitiveField } from '../utils/formDetector.js';

const SYSTEM_PROMPT = `You are FormFillerAssistant. Your job is to take a single job-application question (the text the user sees) plus the user's profile snippets and return a JSON suggestion for how to fill that field. Output only valid JSON (no commentary). Fields you must provide: field_key, answer, confidence (0-1), explanation (1-2 sentences), answer_type (text/select/multiple_choice/file/phone/email), do_not_autofill (true/false). If multiple plausible answers exist, return the highest confidence one and a short list of alternatives in "alternatives" array. Use the provided profile snippets. If the question appears to ask for highly sensitive data (SSN, bank account, ID numbers), set do_not_autofill to true and answer to empty string.`;

export async function matchField(
  field: DetectedField,
  profile: UserProfile,
  contextSnippets: ContextSnippet[] = [],
  storedMapping?: FormMapping
): Promise<FillSuggestion> {
  // Check for sensitive fields first
  if (isSensitiveField(field.questionText)) {
    return {
      field_key: '',
      answer: '',
      answer_type: field.inputType as any,
      confidence: 0,
      explanation: 'Sensitive field detected - requires manual input',
      alternatives: [],
      do_not_autofill: true
    };
  }

  // Check stored mappings first (form mapping persistence)
  if (storedMapping) {
    const mappingMatch = checkStoredMapping(field, profile, storedMapping);
    if (mappingMatch) {
      return mappingMatch;
    }
  }

  // Check if LLM API is configured
  const useLLM = await checkLLMConfig();
  if (useLLM) {
    try {
      return await callLLMAPI(field, profile, contextSnippets);
    } catch (error) {
      console.warn('LLM API call failed, falling back to local matching:', error);
    }
  }

  // Build user prompt
  const userPrompt = buildUserPrompt(field, profile, contextSnippets);
  
  // Fallback to local matching
  return localMatch(field, profile, contextSnippets);
}

// Check stored form mappings
function checkStoredMapping(
  field: DetectedField,
  profile: UserProfile,
  mapping: FormMapping
): FillSuggestion | null {
  const question = field.questionText.toLowerCase();
  
  for (const fieldMapping of mapping.mappings) {
    const pattern = new RegExp(fieldMapping.question_pattern, 'i');
    if (pattern.test(question)) {
      let answer = '';
      let fieldKey = '';
      
      if (fieldMapping.action === 'use_field') {
        fieldKey = fieldMapping.field_key;
        answer = profile.fields[fieldKey] || 
                 (fieldKey === 'name' ? profile.name : '') ||
                 (fieldKey === 'email' ? profile.email : '') ||
                 (fieldKey === 'phone' ? (profile.phone || '') : '') ||
                 (fieldKey === 'location' ? (profile.location || '') : '');
      } else if (fieldMapping.action === 'use_snippet' && fieldMapping.snippet_id) {
        const snippet = profile.cover_letter_snippets.find(s => s.id === fieldMapping.snippet_id);
        if (snippet) {
          answer = snippet.text;
          fieldKey = `cover_letter_snippet:${snippet.id}`;
        }
      }
      
      if (answer) {
        return {
          field_key: fieldKey,
          answer,
          answer_type: field.inputType as any,
          confidence: 0.95, // High confidence for stored mappings
          explanation: `Using saved mapping for this form pattern`,
          alternatives: [],
          do_not_autofill: false
        };
      }
    }
  }
  
  return null;
}

// Check if LLM is configured
async function checkLLMConfig(): Promise<boolean> {
  try {
    const settings = await chrome.storage.local.get(['llm_api_key', 'llm_provider', 'llm_enabled']);
    return !!(settings.llm_enabled && settings.llm_api_key && settings.llm_provider);
  } catch {
    return false;
  }
}

// Call LLM API (structure for integration)
async function callLLMAPI(
  field: DetectedField,
  profile: UserProfile,
  contextSnippets: ContextSnippet[]
): Promise<FillSuggestion> {
  const settings = await chrome.storage.local.get(['llm_api_key', 'llm_provider', 'llm_model']);
  const apiKey = settings.llm_api_key;
  const provider = settings.llm_provider || 'openai';
  const model = settings.llm_model || 'gpt-4';
  
  const userPrompt = buildUserPrompt(field, profile, contextSnippets);
  
  // OpenAI API structure
  if (provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3
      })
    });
    
    if (!response.ok) {
      throw new Error(`LLM API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    if (content) {
      try {
        const suggestion = JSON.parse(content);
        return {
          ...suggestion,
          answer_type: field.inputType as any
        };
      } catch (e) {
        throw new Error('Failed to parse LLM response');
      }
    }
  }
  
  // Add other providers (Anthropic, etc.) here
  throw new Error('LLM provider not implemented');
}

function buildUserPrompt(
  field: DetectedField,
  profile: UserProfile,
  contextSnippets: ContextSnippet[]
): string {
  const profileSummary = {
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    fields: profile.fields,
    cover_letter_snippets: profile.cover_letter_snippets.map(s => ({
      id: s.id,
      title: s.title,
      text: s.text.substring(0, 200) // Truncate for token limits
    }))
  };

  return `QuestionText: "${field.questionText}"
InputType: "${field.inputType}"
Domain: "${window.location.hostname}"
Profile: ${JSON.stringify(profileSummary)}
ContextSnippets: ${JSON.stringify(contextSnippets)}
VisiblePageText: "${document.title}"

Return JSON with exactly these keys:
{
  "field_key": "string",
  "answer": "string",
  "answer_type": "text|select|radio|checkbox|file|phone|email",
  "confidence": 0.00,
  "explanation": "string",
  "alternatives": [{"answer":"...","confidence":0.00}],
  "do_not_autofill": true|false
}`;
}

// Local matching algorithm (fallback for MVP)
function localMatch(
  field: DetectedField,
  profile: UserProfile,
  contextSnippets: ContextSnippet[]
): FillSuggestion {
  const question = field.questionText.toLowerCase();
  let bestMatch: FillSuggestion | null = null;
  let bestConfidence = 0;

  // Try exact field matches
  for (const [key, value] of Object.entries(profile.fields)) {
    const confidence = calculateFieldMatch(question, key);
    if (confidence > bestConfidence && confidence > 0.5) {
      bestConfidence = confidence;
      bestMatch = {
        field_key: key,
        answer: value,
        answer_type: field.inputType as any,
        confidence,
        explanation: `Matched profile field "${key}"`,
        alternatives: [],
        do_not_autofill: false
      };
    }
  }

  // Try common patterns
  const patterns: Array<{ pattern: RegExp; field: string; confidence: number }> = [
    { pattern: /(name|full name|your name)/i, field: 'name', confidence: 0.9 },
    { pattern: /(email|e-mail|email address)/i, field: 'email', confidence: 0.9 },
    { pattern: /(phone|telephone|mobile|contact number)/i, field: 'phone', confidence: 0.85 },
    { pattern: /(location|city|where are you|address)/i, field: 'location', confidence: 0.8 },
    { pattern: /(years? of experience|experience|yrs)/i, field: 'experience_years', confidence: 0.8 },
    { pattern: /(salary|expected salary|compensation)/i, field: 'expected_salary', confidence: 0.75 },
    { pattern: /(current title|current role|job title)/i, field: 'current_title', confidence: 0.8 },
    { pattern: /(resume|cv|curriculum vitae)/i, field: 'resume', confidence: 0.9 }
  ];

  for (const { pattern, field: fieldKey, confidence } of patterns) {
    if (pattern.test(question)) {
      const value = profile.fields[fieldKey] || 
                   (fieldKey === 'name' ? profile.name : '') ||
                   (fieldKey === 'email' ? profile.email : '') ||
                   (fieldKey === 'phone' ? profile.phone : '') ||
                   (fieldKey === 'location' ? profile.location : '');
      
      if (value && confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = {
          field_key: fieldKey,
          answer: value,
          answer_type: field.inputType as any,
          confidence,
          explanation: `Matched common pattern for "${fieldKey}"`,
          alternatives: [],
          do_not_autofill: false
        };
      }
    }
  }

  // Try snippet matching
  for (const snippet of contextSnippets) {
    if (snippet.similarity > bestConfidence && snippet.similarity > 0.6) {
      bestConfidence = snippet.similarity;
      bestMatch = {
        field_key: `cover_letter_snippet:${snippet.id}`,
        answer: snippet.text,
        answer_type: field.inputType as any,
        confidence: snippet.similarity,
        explanation: `Matched profile snippet "${snippet.title}"`,
        alternatives: [],
        do_not_autofill: false
      };
    }
  }

  // Default: no match
  if (!bestMatch) {
    return {
      field_key: '',
      answer: '',
      answer_type: field.inputType as any,
      confidence: 0,
      explanation: 'No matching field or snippet found in profile',
      alternatives: [],
      do_not_autofill: true
    };
  }

  return bestMatch;
}

function calculateFieldMatch(question: string, fieldKey: string): number {
  const questionWords = question.split(/\s+/);
  const fieldWords = fieldKey.toLowerCase().split(/[_\s]+/);
  
  let matches = 0;
  for (const fieldWord of fieldWords) {
    if (question.includes(fieldWord)) {
      matches++;
    }
  }
  
  if (matches === 0) return 0;
  return Math.min(0.9, 0.5 + (matches / fieldWords.length) * 0.4);
}

// Enhanced embedding-based snippet retrieval
export async function findMatchingSnippets(
  question: string,
  profile: UserProfile,
  topK: number = 3
): Promise<ContextSnippet[]> {
  // Try to use embedding API if available
  const useEmbeddings = await checkEmbeddingConfig();
  if (useEmbeddings) {
    try {
      return await findSnippetsWithEmbeddings(question, profile, topK);
    } catch (error) {
      console.warn('Embedding API failed, using local matching:', error);
    }
  }
  
  // Enhanced local matching with better similarity scoring
  return findSnippetsLocal(question, profile, topK);
}

async function checkEmbeddingConfig(): Promise<boolean> {
  try {
    const settings = await chrome.storage.local.get(['embedding_api_key', 'embedding_enabled']);
    return !!(settings.embedding_enabled && settings.embedding_api_key);
  } catch {
    return false;
  }
}

async function findSnippetsWithEmbeddings(
  question: string,
  profile: UserProfile,
  topK: number
): Promise<ContextSnippet[]> {
  const settings = await chrome.storage.local.get(['embedding_api_key']);
  const apiKey = settings.embedding_api_key;
  
  // Get question embedding
  const questionEmbedding = await getEmbedding(question, apiKey);
  
  // Get snippet embeddings (cache these in production)
  const snippetEmbeddings = await Promise.all(
    profile.cover_letter_snippets.map(async (snippet) => {
      const embedding = await getEmbedding(snippet.text, apiKey);
      const similarity = cosineSimilarity(questionEmbedding, embedding);
      return {
        id: snippet.id,
        title: snippet.title,
        text: snippet.text,
        similarity
      };
    })
  );
  
  return snippetEmbeddings
    .filter(s => s.similarity > 0.3)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text
    })
  });
  
  if (!response.ok) {
    throw new Error('Embedding API error');
  }
  
  const data = await response.json();
  return data.data[0].embedding;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function findSnippetsLocal(
  question: string,
  profile: UserProfile,
  topK: number
): ContextSnippet[] {
  const questionLower = question.toLowerCase();
  const questionWords = questionLower.split(/\W+/).filter(w => w.length > 2);
  const snippets: ContextSnippet[] = [];

  for (const snippet of profile.cover_letter_snippets) {
    const snippetText = snippet.text.toLowerCase();
    const snippetTitle = snippet.title.toLowerCase();
    const snippetWords = snippetText.split(/\W+/).filter(w => w.length > 2);
    
    // Enhanced similarity: word overlap + keyword matching + title matching
    let matches = 0;
    let keywordMatches = 0;
    
    // Check word overlap
    questionWords.forEach(qw => {
      if (snippetWords.includes(qw)) {
        matches++;
      }
      // Check for partial matches (stems)
      if (snippetWords.some(sw => sw.includes(qw) || qw.includes(sw))) {
        keywordMatches++;
      }
    });
    
    // Title match bonus
    const titleMatch = questionWords.some(qw => snippetTitle.includes(qw)) ? 0.2 : 0;
    
    // Calculate similarity with better weighting
    const wordOverlap = matches / Math.max(questionWords.length, 1);
    const keywordBonus = keywordMatches / Math.max(questionWords.length * 2, 1);
    const similarity = Math.min(0.95, wordOverlap * 0.6 + keywordBonus * 0.3 + titleMatch);
    
    if (similarity > 0.3) {
      snippets.push({
        id: snippet.id,
        title: snippet.title,
        text: snippet.text,
        similarity
      });
    }
  }

  return snippets
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

