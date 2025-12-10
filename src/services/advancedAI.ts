// Advanced AI Features - Streamlined for core job application functionality
// Focused on: ATS Optimization, Job Matching, Cover Letter Generation

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

interface PerplexityMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function callAI(messages: PerplexityMessage[], apiKey: string): Promise<string> {
  const response = await fetch(PERPLEXITY_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar-pro',
      messages,
      max_tokens: 2000,
      temperature: 0.3,
    }),
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);
  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

// ============================================
// 1. JOB DESCRIPTION ANALYZER
// ============================================
export interface JobAnalysis {
  company: string;
  title: string;
  requirements: string[];
  preferredSkills: string[];
  keywords: string[];
  experienceLevel: string;
  salary?: string;
  matchScore: number;
  missingSkills: string[];
  strongMatches: string[];
}

export async function analyzeJobDescription(
  jobDescription: string,
  profile: any,
  apiKey: string
): Promise<JobAnalysis> {
  const systemPrompt = `You are an expert job market analyst and ATS specialist. Analyze job descriptions to extract key information and match against candidate profiles.

Return ONLY valid JSON with this structure:
{
  "company": "company name",
  "title": "job title",
  "requirements": ["required skill 1", "required skill 2"],
  "preferredSkills": ["nice to have 1", "nice to have 2"],
  "keywords": ["ATS keyword 1", "keyword 2", "keyword 3"],
  "experienceLevel": "entry/mid/senior/executive",
  "salary": "salary range if mentioned",
  "matchScore": 0-100,
  "missingSkills": ["skills candidate lacks"],
  "strongMatches": ["candidate's matching strengths"]
}`;

  const userPrompt = `## JOB DESCRIPTION
${jobDescription}

## CANDIDATE PROFILE
${JSON.stringify({
  title: profile.fields?.current_title,
  skills: profile.fields?.skills,
  experience: profile.fields?.years_experience,
  resume: profile.resume_text?.substring(0, 3000)
}, null, 2)}

Analyze this job and rate the candidate's fit.`;

  try {
    const response = await callAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], apiKey);

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('Job analysis error:', error);
  }

  return {
    company: 'Unknown',
    title: 'Unknown',
    requirements: [],
    preferredSkills: [],
    keywords: [],
    experienceLevel: 'unknown',
    matchScore: 0,
    missingSkills: [],
    strongMatches: []
  };
}

// ============================================
// 2. ATS RESUME OPTIMIZER
// ============================================
export interface ATSOptimization {
  score: number;
  missingKeywords: string[];
  suggestedAdditions: string[];
  formatIssues: string[];
  optimizedSummary: string;
}

export async function optimizeResumeForATS(
  resumeText: string,
  jobDescription: string,
  apiKey: string
): Promise<ATSOptimization> {
  const systemPrompt = `You are an ATS (Applicant Tracking System) optimization expert who has helped 10,000+ candidates pass ATS screens.

Analyze the resume against the job description and provide optimization suggestions.

Return ONLY valid JSON:
{
  "score": 0-100,
  "missingKeywords": ["keyword from JD not in resume"],
  "suggestedAdditions": ["specific phrases to add"],
  "formatIssues": ["formatting problems for ATS"],
  "optimizedSummary": "rewritten professional summary with keywords"
}`;

  const userPrompt = `## CURRENT RESUME
${resumeText}

## TARGET JOB DESCRIPTION
${jobDescription}

Optimize this resume to score higher in ATS systems for this specific job.`;

  try {
    const response = await callAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], apiKey);

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('ATS optimization error:', error);
  }

  return {
    score: 0,
    missingKeywords: [],
    suggestedAdditions: [],
    formatIssues: [],
    optimizedSummary: ''
  };
}

// ============================================
// 3. COVER LETTER GENERATOR (FULL)
// ============================================
export async function generateFullCoverLetter(
  jobTitle: string,
  company: string,
  jobDescription: string,
  profile: any,
  hiringManager: string | null,
  apiKey: string
): Promise<string> {
  const systemPrompt = `You are an elite cover letter writer who has helped candidates land jobs at Google, Goldman Sachs, McKinsey, and other top firms.

Write a compelling, personalized cover letter that:
1. Opens with a hook that grabs attention
2. Shows genuine knowledge of the company
3. Connects specific achievements to job requirements
4. Uses metrics and concrete examples
5. Shows enthusiasm without being generic
6. Has a confident, professional close

DO NOT use clichés like "I am writing to apply" or "I believe I would be a great fit."
Be specific, memorable, and authentic.

Return ONLY the cover letter text, properly formatted.`;

  const userPrompt = `## JOB DETAILS
Position: ${jobTitle}
Company: ${company}
${hiringManager ? `Hiring Manager: ${hiringManager}` : ''}

## JOB DESCRIPTION
${jobDescription}

## CANDIDATE'S RESUME
${profile.resume_text || ''}

## CANDIDATE INFO
Name: ${profile.name || profile.first_name + ' ' + profile.last_name}
Current Role: ${profile.fields?.current_title || ''}
Experience: ${profile.fields?.years_experience || ''} years
Skills: ${profile.fields?.skills || ''}

Write a compelling cover letter that would make this candidate stand out.`;

  try {
    const response = await callAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], apiKey);

    return response.trim();
  } catch (error) {
    console.error('Cover letter generation error:', error);
    return '';
  }
}

// ============================================
// 4. QUICK KEYWORD MATCHER
// Simple function to check resume keywords against job description
// ============================================
export function quickKeywordMatch(resumeText: string, jobDescription: string): {
  matchedKeywords: string[];
  missingKeywords: string[];
  matchPercentage: number;
} {
  // Common technical keywords and skills
  const extractKeywords = (text: string): Set<string> => {
    const keywords = new Set<string>();
    const lowerText = text.toLowerCase();
    
    // Programming languages & frameworks
    const techPatterns = [
      /\b(python|javascript|typescript|java|c\+\+|c#|ruby|go|rust|swift|kotlin)\b/gi,
      /\b(react|angular|vue|node\.?js|express|django|flask|spring|rails)\b/gi,
      /\b(aws|azure|gcp|docker|kubernetes|terraform|jenkins|ci\/cd)\b/gi,
      /\b(sql|mysql|postgresql|mongodb|redis|elasticsearch)\b/gi,
      /\b(machine learning|deep learning|nlp|computer vision|ai)\b/gi,
      /\b(agile|scrum|kanban|jira|confluence)\b/gi,
      /\b(html|css|sass|less|tailwind|bootstrap)\b/gi,
      /\b(git|github|gitlab|bitbucket)\b/gi,
      /\b(rest|graphql|api|microservices)\b/gi,
    ];
    
    // Soft skills and business terms
    const businessPatterns = [
      /\b(leadership|management|communication|teamwork|collaboration)\b/gi,
      /\b(project management|product management|data analysis)\b/gi,
      /\b(excel|powerpoint|word|tableau|power bi)\b/gi,
      /\b(marketing|sales|finance|accounting|hr)\b/gi,
      /\b(strategy|planning|execution|optimization)\b/gi,
    ];
    
    [...techPatterns, ...businessPatterns].forEach(pattern => {
      const matches = lowerText.match(pattern);
      if (matches) {
        matches.forEach(m => keywords.add(m.toLowerCase()));
      }
    });
    
    return keywords;
  };
  
  const jobKeywords = extractKeywords(jobDescription);
  const resumeKeywords = extractKeywords(resumeText);
  
  const matched: string[] = [];
  const missing: string[] = [];
  
  jobKeywords.forEach(keyword => {
    if (resumeKeywords.has(keyword)) {
      matched.push(keyword);
    } else {
      missing.push(keyword);
    }
  });
  
  const matchPercentage = jobKeywords.size > 0 
    ? Math.round((matched.length / jobKeywords.size) * 100)
    : 0;
  
  return {
    matchedKeywords: matched,
    missingKeywords: missing,
    matchPercentage
  };
}
