// Core data types for JobRight AI

export interface UserProfile {
  profile_id: string;
  name: string;
  email: string;
  phone?: string;
  location?: string;
  resume_id?: string;
  cover_letter_snippets: CoverLetterSnippet[];
  fields: Record<string, string>;
  created_at: number;
  updated_at: number;
}

export interface CoverLetterSnippet {
  id: string;
  title: string;
  text: string;
}

export interface FormMapping {
  domain: string;
  form_hash: string;
  mappings: FieldMapping[];
  created_at: number;
}

export interface FieldMapping {
  question_pattern: string;
  field_key: string;
  action: 'use_field' | 'use_snippet';
  snippet_id?: string;
}

export interface FillSuggestion {
  field_key: string;
  answer: string;
  answer_type: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'file' | 'phone' | 'email';
  confidence: number;
  explanation: string;
  alternatives: Array<{ answer: string; confidence: number }>;
  do_not_autofill: boolean;
  selector_hint?: string;
}

export interface DetectedField {
  element: HTMLElement;
  questionText: string;
  inputType: string;
  selector: string;
  label?: string;
  placeholder?: string;
}

export interface ContextSnippet {
  id: string;
  title: string;
  text: string;
  similarity: number;
}

export interface ApplicationLog {
  id: string;
  domain: string;
  profile_id: string;
  filled_fields: Array<{
    question: string;
    answer: string;
    field_key: string;
    confidence: number;
  }>;
  submitted_at: number;
}

