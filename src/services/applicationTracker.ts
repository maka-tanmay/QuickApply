// Application Tracker - Track all job applications with status and analytics

export interface Application {
  id: string;
  company: string;
  position: string;
  url: string;
  status: 'saved' | 'applied' | 'interviewing' | 'offered' | 'rejected' | 'withdrawn';
  appliedAt: number;
  updatedAt: number;
  salary?: string;
  location?: string;
  notes: string;
  contacts: Contact[];
  interviews: Interview[];
  followUps: FollowUp[];
  matchScore?: number;
  source: string;
  resumeVersion?: string;
  coverLetterUsed?: boolean;
}

export interface Contact {
  id: string;
  name: string;
  role: string;
  email?: string;
  linkedin?: string;
  notes: string;
}

export interface Interview {
  id: string;
  date: number;
  type: 'phone' | 'video' | 'onsite' | 'technical' | 'behavioral';
  interviewer?: string;
  notes: string;
  outcome?: 'passed' | 'failed' | 'pending';
}

export interface FollowUp {
  id: string;
  dueDate: number;
  type: 'email' | 'call' | 'linkedin';
  completed: boolean;
  notes: string;
}

export interface ApplicationStats {
  total: number;
  byStatus: Record<string, number>;
  responseRate: number;
  interviewRate: number;
  offerRate: number;
  averageTimeToResponse: number;
  topSources: Array<{ source: string; count: number }>;
  weeklyApplications: Array<{ week: string; count: number }>;
}

// Generate unique ID
export function generateId(): string {
  return crypto.randomUUID();
}

// Calculate application statistics
export function calculateStats(applications: Application[]): ApplicationStats {
  const total = applications.length;
  
  // Count by status
  const byStatus: Record<string, number> = {
    saved: 0,
    applied: 0,
    interviewing: 0,
    offered: 0,
    rejected: 0,
    withdrawn: 0
  };
  
  applications.forEach(app => {
    byStatus[app.status] = (byStatus[app.status] || 0) + 1;
  });
  
  // Calculate rates
  const applied = applications.filter(a => a.status !== 'saved');
  const gotResponse = applications.filter(a => 
    ['interviewing', 'offered', 'rejected'].includes(a.status)
  );
  const gotInterview = applications.filter(a => 
    ['interviewing', 'offered'].includes(a.status)
  );
  const gotOffer = applications.filter(a => a.status === 'offered');
  
  const responseRate = applied.length > 0 ? (gotResponse.length / applied.length) * 100 : 0;
  const interviewRate = applied.length > 0 ? (gotInterview.length / applied.length) * 100 : 0;
  const offerRate = applied.length > 0 ? (gotOffer.length / applied.length) * 100 : 0;
  
  // Average time to response (for those who got responses)
  let totalDays = 0;
  let responseCount = 0;
  gotResponse.forEach(app => {
    const days = (app.updatedAt - app.appliedAt) / (1000 * 60 * 60 * 24);
    if (days > 0 && days < 90) { // Reasonable range
      totalDays += days;
      responseCount++;
    }
  });
  const averageTimeToResponse = responseCount > 0 ? totalDays / responseCount : 0;
  
  // Top sources
  const sourceCounts: Record<string, number> = {};
  applications.forEach(app => {
    sourceCounts[app.source] = (sourceCounts[app.source] || 0) + 1;
  });
  const topSources = Object.entries(sourceCounts)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  
  // Weekly applications (last 8 weeks)
  const weeklyApplications: Array<{ week: string; count: number }> = [];
  const now = Date.now();
  for (let i = 7; i >= 0; i--) {
    const weekStart = now - (i + 1) * 7 * 24 * 60 * 60 * 1000;
    const weekEnd = now - i * 7 * 24 * 60 * 60 * 1000;
    const count = applications.filter(a => 
      a.appliedAt >= weekStart && a.appliedAt < weekEnd
    ).length;
    const weekLabel = new Date(weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    weeklyApplications.push({ week: weekLabel, count });
  }
  
  return {
    total,
    byStatus,
    responseRate: Math.round(responseRate),
    interviewRate: Math.round(interviewRate),
    offerRate: Math.round(offerRate),
    averageTimeToResponse: Math.round(averageTimeToResponse),
    topSources,
    weeklyApplications
  };
}

// Get applications due for follow-up
export function getFollowUpsDue(applications: Application[]): Array<{
  application: Application;
  followUp: FollowUp;
  daysOverdue: number;
}> {
  const now = Date.now();
  const results: Array<{ application: Application; followUp: FollowUp; daysOverdue: number }> = [];
  
  applications.forEach(app => {
    app.followUps
      .filter(f => !f.completed && f.dueDate <= now)
      .forEach(followUp => {
        const daysOverdue = Math.floor((now - followUp.dueDate) / (1000 * 60 * 60 * 24));
        results.push({ application: app, followUp, daysOverdue });
      });
  });
  
  return results.sort((a, b) => b.daysOverdue - a.daysOverdue);
}

// Get upcoming interviews
export function getUpcomingInterviews(applications: Application[]): Array<{
  application: Application;
  interview: Interview;
  daysUntil: number;
}> {
  const now = Date.now();
  const results: Array<{ application: Application; interview: Interview; daysUntil: number }> = [];
  
  applications.forEach(app => {
    app.interviews
      .filter(i => i.date > now && i.outcome === 'pending')
      .forEach(interview => {
        const daysUntil = Math.floor((interview.date - now) / (1000 * 60 * 60 * 24));
        results.push({ application: app, interview, daysUntil });
      });
  });
  
  return results.sort((a, b) => a.daysUntil - b.daysUntil);
}

// Smart suggestions based on application status
export function getSuggestions(applications: Application[]): string[] {
  const suggestions: string[] = [];
  const stats = calculateStats(applications);
  
  // Low response rate
  if (stats.total > 10 && stats.responseRate < 20) {
    suggestions.push('💡 Your response rate is low. Consider customizing your resume for each application and adding a cover letter.');
  }
  
  // No recent applications
  const lastWeek = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentApps = applications.filter(a => a.appliedAt > lastWeek);
  if (recentApps.length === 0 && applications.length > 0) {
    suggestions.push('📅 No applications this week. Stay consistent with your job search!');
  }
  
  // Pending follow-ups
  const overdueFollowUps = getFollowUpsDue(applications);
  if (overdueFollowUps.length > 0) {
    suggestions.push(`⏰ You have ${overdueFollowUps.length} overdue follow-ups. Following up can increase your response rate by 30%!`);
  }
  
  // Applications without notes
  const noNotes = applications.filter(a => !a.notes && a.status === 'applied');
  if (noNotes.length > 5) {
    suggestions.push('📝 Add notes to your applications to remember key details for interviews.');
  }
  
  // High interview-to-offer ratio suggestion
  if (stats.interviewRate > 30 && stats.offerRate < 10) {
    suggestions.push('🎯 You\'re getting interviews but not offers. Consider practicing interview skills or asking for feedback.');
  }
  
  return suggestions;
}

