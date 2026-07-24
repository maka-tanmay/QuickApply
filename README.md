# JobRight AI - Chrome Extension

AI-powered auto-fill extension for job applications. Automatically detects form fields, matches them to your profile data, and suggests answers with confidence scores.

## Features

- **Smart Form Detection**: Automatically detects form fields and extracts question text from labels, placeholders, and surrounding context
- **AI-Powered Matching**: Matches form questions to your profile data using intelligent pattern matching and snippet retrieval
- **Multiple Profiles**: Create and manage multiple profiles for different job types or career stages
- **Confidence Scoring**: Each suggestion includes a confidence score and explanation
- **Safety First**: Blocks auto-fill for sensitive fields (SSN, passwords, etc.)
- **Local-First**: All data stored locally in your browser by default
- **Privacy-Focused**: Encrypted storage for sensitive profile data

## Installation

### Development Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the extension:**
   ```bash
   npm run build
   ```

3. **Load in Chrome:**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `extension for job application` directory

4. **Add Icons:**
   - Create an `icons` folder in the project root
   - Add three PNG files: `icon16.png`, `icon48.png`, and `icon128.png`
   - Or use placeholder icons (16x16, 48x48, 128x128 pixels)

## Usage

### First Time Setup

1. Click the JobRight AI icon in your Chrome toolbar
2. Click "Manage Profiles" to create your first profile
3. Fill in your information:
   - Name, email, phone, location
   - Custom fields (e.g., `current_title`, `experience_years`, `expected_salary`)
   - Cover letter snippets for common questions
4. Select your profile as the active profile

### Using on Job Applications

1. Navigate to a job application page
2. The extension will automatically scan for forms
3. A panel will appear on the right side showing suggestions
4. Review each suggestion:
   - **Green background**: High confidence (>85%), safe to auto-fill
   - **Yellow background**: Sensitive field, requires review
   - **Gray background**: Lower confidence, review before accepting
5. Click "Accept" for individual fields or "Accept All Safe Fields" for bulk fill
6. Edit any field before accepting if needed

## Project Structure

```
.
├── src/
│   ├── types.ts              # TypeScript type definitions
│   ├── content.ts            # Content script (runs on pages)
│   ├── background.ts         # Service worker (background tasks)
│   ├── utils/
│   │   ├── storage.ts        # IndexedDB storage utilities
│   │   ├── encryption.ts     # WebCrypto encryption
│   │   └── formDetector.ts   # Form detection logic
│   └── services/
│       └── aiMatcher.ts      # AI matching service
├── popup.html/js             # Extension popup UI
├── options.html/js           # Settings page
├── manifest.json             # Extension manifest
├── tsconfig.json             # TypeScript configuration
└── package.json              # Dependencies and scripts
```

## Development

### Build Commands

- `npm run build` - Build TypeScript to JavaScript
- `npm run watch` - Watch mode for development
- `npm run copy-assets` - Copy assets to dist folder

### Architecture

- **Content Script** (`content.ts`): Runs on every page, detects forms, shows overlay UI
- **Background Service Worker** (`background.ts`): Handles storage, message routing, settings
- **Storage Layer** (`storage.ts`): IndexedDB operations for profiles, mappings, logs
- **AI Matcher** (`aiMatcher.ts`): Matching logic (currently local algorithm, ready for LLM integration)

### Adding LLM Integration

The extension is designed to work with LLM APIs. To integrate:

1. Update `src/services/aiMatcher.ts`:
   - Replace `localMatch()` with an API call to your LLM provider
   - Use the `buildUserPrompt()` function to format requests
   - Parse structured JSON responses

2. Add API key management:
   - Store API keys securely in `chrome.storage.local`
   - Add settings UI for API key configuration

3. Example LLM call:
   ```typescript
   const response = await fetch('https://api.openai.com/v1/chat/completions', {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${apiKey}`,
       'Content-Type': 'application/json'
     },
     body: JSON.stringify({
       model: 'gpt-4',
       messages: [
         { role: 'system', content: SYSTEM_PROMPT },
         { role: 'user', content: userPrompt }
       ],
       response_format: { type: 'json_object' }
     })
   });
   ```

## Claude Code CLI Provider (no API key)

The extension can use your locally installed Claude Code CLI instead of a paid API, via Chrome native messaging:

1. Load the extension and copy its ID from `chrome://extensions` (Developer mode on)
2. Run: `./native-host/install.sh <extension-id>`
3. Restart Chrome, then pick **Claude Code CLI** as the AI provider in Options → AI Settings

Requests run through `claude -p` on your machine — covered by your Claude subscription, no per-token billing.

## Privacy & Security

- **Local Storage**: All profile data stored locally in IndexedDB
- **Encryption**: Sensitive fields encrypted using WebCrypto API
- **No Auto-Submit by Default**: Requires explicit user confirmation
- **Sensitive Field Detection**: Automatically blocks auto-fill for SSN, passwords, etc.
- **No Data Collection**: Extension does not send data to external servers (unless you configure LLM API)

## Limitations & Future Work

### Current MVP Features
- ✅ Local pattern matching
- ✅ Basic form detection
- ✅ Profile management
- ✅ Overlay UI with suggestions
- ✅ Safety checks for sensitive fields

### Implemented Enhancements ✅
- [x] **LLM integration** - Structure in place with OpenAI API support (configure in Advanced settings)
- [x] **Embedding-based snippet retrieval** - Enhanced local matching + optional embedding API support
- [x] **Form mapping persistence** - Save mappings per domain, auto-apply on return visits
- [x] **Application history and audit logs** - Track all filled applications with history UI
- [x] **Multi-page form support** - State persistence across navigation, SPA support
- [x] **Shadow DOM support** - Detects form fields in Shadow DOM and web components
- [x] **File upload handling** - Detects resume fields and provides user guidance
- [x] **Cloud sync structure** - Optional encrypted cloud sync framework (ready for backend)

### New Features Added
- **Save Mapping** button on each suggestion to remember field patterns
- **History tab** in options page to view application logs
- **Advanced settings** for LLM and embedding API configuration
- **Enhanced snippet matching** with better similarity scoring
- **Form state persistence** across page navigation
- **Shadow DOM traversal** for modern web apps

## License

MIT License - feel free to use and modify for your needs.

## Contributing

This is a prototype/MVP. Contributions welcome! Areas for improvement:
- Better form detection heuristics
- LLM integration examples
- UI/UX enhancements
- Test coverage
- Documentation

## Support

For issues or questions, please open an issue in the repository.
