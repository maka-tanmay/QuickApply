# QuickApply (JobRight AI) — UI Design Brief

## 1. Product summary

QuickApply is a Chrome extension that auto-fills job applications. The user builds a profile once (contact info, work authorization, education, links, pre-written answers to common essay questions). On any job application page — Workday, Greenhouse, Lever, iCIMS, Taleo, SmartRecruiters, Ashby, or generic career sites — the extension detects the form, matches every question to the profile, and shows an in-page panel of suggested answers. The user reviews, optionally edits, and fills everything with one click. It never auto-submits and never touches resume-upload or sensitive fields (SSN, passwords). AI features (answering open-ended questions, generating cover letters) run through the user's local Claude CLI or a cloud API. Every filled application is logged to a built-in tracker.

**Product values the design must express:** trust (you see exactly what gets filled before it happens), speed (an application drops from ~20 minutes to ~2), and honesty (failed fills are shown, not hidden; nothing is submitted for you).

**User:** a job seeker mid-application — often on their 40th application of the week, tired, on a cramped ATS page. Design for low cognitive load and fast scanning.

## 2. UI surfaces to design

### A. In-page overlay panel (the core surface — most design effort here)
Injected into arbitrary job sites, fixed top-right, currently 400px wide, max-height 85vh.

Structure, top to bottom:
1. **Header** — brand + two icon buttons: minimize, close.
2. **Context bar** — active profile name.
3. **Status bar** — "17 ready to fill" → after filling: "15 filled • 2 need manual input".
4. **Tabs** — "Suggestions" | "Missing (N)".
5. **Suggestion cards** (scrollable list). Each card: question text (up to 2 lines), input-type badge (text / radio / select / custom), suggested answer (inline-editable), confidence % + source tag. Click card = fill that one field.
6. **Missing tab** — questions the profile can't answer yet, each with the profile key to add, plus "Open Profile" button.
7. **Action row** — primary "Fill All (N)" → post-fill "Fill Again (N)"; secondary "Close".
8. **AI section** (when AI enabled) — "Get AI help for unanswered questions", "Generate Cover Letter".

**States to design:** pre-fill (default), per-card filled (success), per-card failed ("fill manually" — needs attention without alarm), post-fill summary, empty/no-matches, **minimized pill** (small floating pill bottom-right showing brand + count; click to re-expand), and a toast/snackbar for transient messages (success / warning / info).

**Hard constraints:** must visually survive any host page (aggressive CSS resets, arbitrary backgrounds); avoid covering the form being filled (that's why minimize exists); no external font loading; must read as trustworthy on both light and dark host pages.

### B. Popup (toolbar dropdown, 360px wide)
1. Header: logo + name, status pill (Active/Paused), master on/off toggle.
2. Active-profile selector (dropdown).
3. Profile card: avatar initials, name, email, profile-completeness progress bar + %.
4. Actions: "Build Resume" (primary), "Auto-Fill This Page", "Auto-scan job pages" toggle, "Generate Cover Letter".
5. Footer: version, Settings / Help links.
States: enabled, paused (grayed content + explainer), no-profile-yet (empty state with CTA).

### C. Options page (full-tab settings, the "home base")
Sections:
1. **Profiles** — list of profiles (create/edit/delete/set-active); profile editor form: basic info (name, email, phone, location, country, username), work & legal (work authorization, sponsorship, over-18, relocation, remote/in-office), education (university, major, GPA, graduation date, enrolled), links (LinkedIn, GitHub, portfolio), compensation & availability (salary, start date, years of experience), **custom key→value field rows** (add/remove), **answers bank** — ~10 textareas for essay questions (why interested, why company, about yourself, strengths, weaknesses, leadership, challenge, achievement, future goals, additional info), resume text paste + "parse resume" import, LinkedIn import.
2. **AI Settings** — provider picker: Claude Code CLI (local, no API key — recommended, needs one-time native-host install with instructions), OpenRouter, Perplexity, DeepSeek; per-provider API key + model fields; test-connection button with success/error status.
3. **History / Learning** — application logs; AI learning stats (cover letters learned, preferred phrases).
This page is long — needs clear navigation (sidebar or tabs) and a form design that makes ~40 fields feel light (grouping, progressive disclosure).

### D. Dashboard (application tracker)
Stat tiles: total applications, response rate, interviews, offers. Application list (company, position, status: saved/applied/interviewing/offered/rejected/withdrawn, date, source). Upcoming follow-ups. Suggestions. Applications are auto-logged on every Fill All, so this fills itself — design for that story.

### E. In-page modals (injected like the overlay, same constraints)
- **AI Assistant** — list of unanswered open-ended questions, AI-generate per question, editable results, insert into form.
- **Cover Letter Generator** — detected company + job title (editable), generate, rich preview, edit, copy/insert/save.

## 3. Current visual language (feel free to evolve, keep the spirit)

- Accent: indigo→violet gradient (#4F46E5 → #7C3AED); success green #22c55e; warning amber #f59e0b; danger red #ef4444.
- Neutrals: slate scale (#f8fafc backgrounds, #64748b secondary text, #1e293b primary text).
- Type: DM Sans (popup/options); system font stack in injected UI.
- Shape: rounded (8–14px radii), soft shadows, pill-shaped status chips, card-based lists.
- Tone: confident, quietly premium, not playful-startup. Emoji currently used as icons (🚀 ✅ ⚠️) — replace with a proper icon set.

## 4. Deliverables requested from the designer

1. Design tokens (color incl. dark mode, type scale, spacing, radii, elevation) usable in both regular pages and injected content.
2. High-fidelity mocks of all five surfaces in every state listed above (overlay panel first — it's 80% of usage).
3. Component sheet: suggestion card (default/hover/editing/filled/failed), buttons, tabs, toggles, badges, toasts, progress bar, stat tile, empty states.
4. The minimized-pill ↔ expanded-panel transition.
5. Icon set direction (replace emoji).
6. Accessibility: WCAG AA contrast, visible focus states, ≥13px text in injected UI.
