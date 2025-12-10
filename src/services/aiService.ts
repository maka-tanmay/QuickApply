// AI Service - Perplexity API Integration
// Enhanced to act as a top-tier job applicant

interface PerplexityMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface PerplexityResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface MatchResult {
  answer: string;
  confidence: number;
  explanation: string;
  field_key: string;
  alternatives?: string[];
}

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

export async function callPerplexityAPI(
  messages: PerplexityMessage[],
  apiKey: string,
  model: string = 'sonar'
): Promise<string> {
  const response = await fetch(PERPLEXITY_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 1000,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Perplexity API error: ${response.status} - ${error}`);
  }

  const data: PerplexityResponse = await response.json();
  return data.choices[0]?.message?.content || '';
}

// System prompt that makes the AI act like an elite job applicant
const ELITE_APPLICANT_SYSTEM = `You are an ELITE JOB APPLICATION ASSISTANT. Your goal is to help the candidate present themselves as the BEST POSSIBLE applicant.

## YOUR PERSONA
You are a career coach who has helped hundreds of candidates land jobs at top companies (Google, Meta, Amazon, Goldman Sachs). You know exactly what recruiters want to hear.

## RULES FOR ANSWERING
1. ALWAYS use specific examples and quantifiable achievements from the resume
2. Use the STAR method (Situation, Task, Action, Result) when appropriate
3. Be confident but not arrogant - show enthusiasm for the role
4. Highlight transferable skills and relevant experience
5. Use power words: "led", "achieved", "delivered", "optimized", "grew", "built"
6. Keep answers concise but impactful
7. Show alignment with company values and role requirements
8. Never fabricate - only use information from the provided resume/profile
9. For yes/no questions, always add brief context if helpful
10. Sound natural and human, not robotic

## TONE
- Professional yet personable
- Confident and accomplished
- Enthusiastic about the opportunity
- Specific and results-oriented`;

export async function matchQuestionToProfile(
  question: string,
  inputType: string,
  options: string[],
  profile: any,
  apiKey: string
): Promise<MatchResult | null> {
  const systemPrompt = `${ELITE_APPLICANT_SYSTEM}

## TASK
Match this job application question to the candidate's profile and provide the BEST answer.

## OUTPUT FORMAT
Return ONLY valid JSON (no markdown):
{
  "answer": "the best answer to fill",
  "confidence": 0.0 to 1.0,
  "explanation": "why this answer is great",
  "field_key": "which profile field was used"
}

For sensitive fields (SSN, password, bank), return confidence: 0.`;

  const profileSummary = buildProfileSummary(profile);

  const userPrompt = `## QUESTION
"${question}"

## INPUT TYPE
${inputType}
${options.length > 0 ? `Available Options: ${JSON.stringify(options)}` : ''}

## CANDIDATE PROFILE
${profileSummary}

Provide the best answer as a top-tier candidate would.`;

  try {
    const response = await callPerplexityAPI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      apiKey
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('AI response not valid JSON:', response);
      return null;
    }

    return JSON.parse(jsonMatch[0]) as MatchResult;
  } catch (error) {
    console.error('AI matching error:', error);
    return null;
  }
}

export async function answerOpenEndedQuestion(
  question: string,
  profile: any,
  apiKey: string,
  maxLength: number = 500
): Promise<string> {
  const systemPrompt = `${ELITE_APPLICANT_SYSTEM}

## TASK
Answer this job application question as if you ARE the candidate. Write in FIRST PERSON.

## REQUIREMENTS
- Use specific achievements and examples from the resume
- Be compelling and memorable
- Show passion and enthusiasm
- Keep it under ${maxLength} characters
- Use the STAR method for behavioral questions
- Return ONLY the answer text, no formatting or quotes`;

  const profileSummary = buildProfileSummary(profile);

  const userPrompt = `## QUESTION TO ANSWER
"${question}"

## MY BACKGROUND (Write as if you ARE this person)
${profileSummary}

Write a compelling answer that would impress a hiring manager.`;

  try {
    const response = await callPerplexityAPI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      apiKey
    );

    let answer = response.trim();
    // Remove any quotes that might wrap the answer
    if (answer.startsWith('"') && answer.endsWith('"')) {
      answer = answer.slice(1, -1);
    }
    
    if (answer.length > maxLength) {
      answer = answer.substring(0, maxLength - 3) + '...';
    }

    return answer;
  } catch (error) {
    console.error('Open-ended answer error:', error);
    return '';
  }
}

export async function generateCoverLetterSnippet(
  jobTitle: string,
  companyName: string,
  requirements: string[],
  profile: any,
  apiKey: string
): Promise<string> {
  const systemPrompt = `${ELITE_APPLICANT_SYSTEM}

## TASK
Write a compelling cover letter paragraph that would make the candidate stand out.

## REQUIREMENTS
- Reference specific achievements from the resume
- Show genuine enthusiasm for the role
- Connect past experience to job requirements
- Be memorable and unique
- 3-4 sentences maximum
- Return ONLY the paragraph text`;

  const profileSummary = buildProfileSummary(profile);

  const userPrompt = `## JOB DETAILS
Position: ${jobTitle}
Company: ${companyName}
Key Requirements: ${requirements.join(', ') || 'Not specified'}

## CANDIDATE BACKGROUND
${profileSummary}

Write a cover letter paragraph that would make this candidate memorable.`;

  try {
    const response = await callPerplexityAPI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      apiKey
    );

    return response.trim();
  } catch (error) {
    console.error('Cover letter generation error:', error);
    return '';
  }
}

export async function improveAnswer(
  question: string,
  currentAnswer: string,
  profile: any,
  apiKey: string
): Promise<string> {
  const systemPrompt = `${ELITE_APPLICANT_SYSTEM}

## TASK
Improve this job application answer to make it MORE COMPELLING.

## IMPROVEMENTS TO MAKE
1. Add specific metrics/numbers if possible
2. Use stronger action verbs
3. Show more impact and results
4. Make it more memorable
5. Keep similar length
6. Return ONLY the improved answer`;

  const profileSummary = buildProfileSummary(profile);

  const userPrompt = `## QUESTION
"${question}"

## CURRENT ANSWER TO IMPROVE
"${currentAnswer}"

## CANDIDATE BACKGROUND (use for adding specific details)
${profileSummary}

Make this answer more compelling and impactful.`;

  try {
    const response = await callPerplexityAPI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      apiKey
    );

    return response.trim();
  } catch (error) {
    console.error('Answer improvement error:', error);
    return currentAnswer;
  }
}

export async function generateWhyCompanyAnswer(
  companyName: string,
  jobTitle: string,
  profile: any,
  apiKey: string
): Promise<string> {
  const systemPrompt = `${ELITE_APPLICANT_SYSTEM}

## TASK
Answer "Why do you want to work at this company?" in a compelling way.

## REQUIREMENTS
- Research-backed (mention something specific about the company)
- Connect to candidate's career goals
- Show genuine enthusiasm
- Reference relevant experience
- 3-4 sentences
- Return ONLY the answer`;

  const profileSummary = buildProfileSummary(profile);

  const userPrompt = `## COMPANY
${companyName}

## POSITION
${jobTitle}

## CANDIDATE BACKGROUND
${profileSummary}

Write a compelling "Why this company?" answer.`;

  try {
    const response = await callPerplexityAPI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      apiKey
    );

    return response.trim();
  } catch (error) {
    console.error('Why company answer error:', error);
    return '';
  }
}

export async function answerBehavioralQuestion(
  question: string,
  profile: any,
  apiKey: string
): Promise<string> {
  const systemPrompt = `${ELITE_APPLICANT_SYSTEM}

## TASK
Answer this behavioral interview question using the STAR method.

## STAR FORMAT
- Situation: Set the context (1 sentence)
- Task: Describe your responsibility (1 sentence)
- Action: Explain what YOU specifically did (2-3 sentences)
- Result: Share the outcome with metrics if possible (1-2 sentences)

## REQUIREMENTS
- Use a REAL example from the resume
- Be specific and detailed
- Show leadership, problem-solving, or impact
- Keep under 200 words
- Return ONLY the answer`;

  const profileSummary = buildProfileSummary(profile);

  const userPrompt = `## BEHAVIORAL QUESTION
"${question}"

## CANDIDATE'S EXPERIENCE TO DRAW FROM
${profileSummary}

Answer using the STAR method with a relevant example from their background.`;

  try {
    const response = await callPerplexityAPI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      apiKey
    );

    return response.trim();
  } catch (error) {
    console.error('Behavioral answer error:', error);
    return '';
  }
}

// Helper function to build a comprehensive profile summary
function buildProfileSummary(profile: any): string {
  const sections: string[] = [];
  
  // Basic info
  sections.push(`Name: ${profile.name || profile.first_name + ' ' + profile.last_name}`);
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
