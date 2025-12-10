# Setup Guide

## Quick Start (5 minutes)

### 1. Install Dependencies

```bash
npm install
```

### 2. Create Icons

You need three icon files in the `icons/` folder:
- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)  
- `icon128.png` (128x128 pixels)

**Quick option**: Create simple colored squares with text using any image editor, or use online tools like:
- [Favicon Generator](https://favicon.io/)
- [Canva](https://www.canva.com/)
- Or any image editor (Photoshop, GIMP, etc.)

**Even quicker**: For testing, you can use any PNG files with the correct dimensions. Chrome will accept them.

### 3. Build the Extension

```bash
npm run build
```

This creates the `dist/` folder with compiled JavaScript.

### 4. Load in Chrome

1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked**
5. Select this directory (`extension for job application`)

### 5. Test It

1. Open `test-page.html` in Chrome (or any page with forms)
2. Click the JobRight AI icon in the toolbar
3. Click "Manage Profiles" to create your first profile
4. Fill in your information and save
5. Reload the test page
6. You should see the overlay panel with suggestions!

## First Profile Setup

1. **Click the extension icon** → "Manage Profiles"
2. **Create a new profile** with:
   - Your name, email, phone, location
   - Custom fields like:
     - `current_title`: "Software Engineer"
     - `experience_years`: "5"
     - `expected_salary`: "$120,000"
   - Cover letter snippets for common questions:
     - Title: "leadership"
     - Text: "Led a 6-person team to deliver..."
3. **Save the profile**
4. **Select it as active** in the popup

## Testing Checklist

- [ ] Extension loads without errors
- [ ] Can create a profile
- [ ] Profile appears in popup
- [ ] Can set profile as active
- [ ] Form fields are detected on test page
- [ ] Suggestions appear in overlay
- [ ] Can accept individual suggestions
- [ ] Fields are filled correctly
- [ ] "Accept All Safe Fields" works

## Troubleshooting

### Extension won't load
- Check `chrome://extensions/` for error messages
- Ensure all files are present (especially icons)
- Verify `dist/` folder exists after build

### No suggestions appearing
- Check browser console (F12) for errors
- Verify a profile is set as active
- Ensure the page has actual form elements
- Check that extension has permission for the site

### Fields not filling
- Check console for JavaScript errors
- Verify selectors are working (inspect elements)
- Try manually accepting suggestions first

### Storage not working
- IndexedDB requires non-incognito mode (by default)
- Check Chrome's storage settings
- Clear extension data and try again

## Development Mode

For active development:

```bash
npm run watch
```

This rebuilds automatically when you change TypeScript files. After each rebuild:
1. Go to `chrome://extensions/`
2. Click the reload icon on the extension card

## Next Steps

- Customize the matching logic in `src/services/aiMatcher.ts`
- Add LLM integration (see README.md)
- Improve form detection heuristics
- Add more UI features
- Test on real job application sites

## File Structure

```
.
├── src/              # TypeScript source (edit these)
├── dist/             # Compiled output (auto-generated)
├── icons/            # Extension icons (you create these)
├── popup.html/js     # Popup UI
├── options.html/js   # Settings page
├── manifest.json     # Extension config
└── test-page.html    # Test form for development
```

## Need Help?

- Check `README.md` for architecture details
- Review `BUILD.md` for build troubleshooting
- Check browser console for runtime errors
- Review Chrome extension documentation

