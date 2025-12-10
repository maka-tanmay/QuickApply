# 🎬 JobRight AI - Demo Guide

## Quick Start Demo

### Step 1: Create Icons (Required for Extension to Load)

The extension needs icon files. You have two options:

**Option A: Use Placeholder Icons (Quick)**
```bash
# Icons folder should exist, create simple placeholders
touch icons/icon16.png icons/icon48.png icons/icon128.png
```

**Option B: Create Real Icons (Recommended)**
1. Open `create-icons.html` in your browser
2. It will automatically download 3 icon files
3. Move them to the `icons/` folder

Or use any image editor to create:
- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)  
- `icon128.png` (128x128 pixels)

### Step 2: Load Extension in Chrome

1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked**
5. Select this directory: `/Users/tanmaymaka/Desktop/extension for job application`
6. The extension should appear in your extensions list

### Step 3: Create Your First Profile

1. Click the **JobRight AI** icon in Chrome toolbar
2. Click **"Manage Profiles"**
3. Fill in your information:
   - **Name**: Your name
   - **Email**: your.email@example.com
   - **Phone**: +1-234-567-8900
   - **Location**: Your city, Country
4. Add some **Profile Fields**:
   - Field: `current_title` → Value: `Software Engineer`
   - Field: `experience_years` → Value: `5`
   - Field: `expected_salary` → Value: `$120,000`
5. Add a **Cover Letter Snippet**:
   - Title: `leadership`
   - Text: `Led a 6-person cross-functional team to deliver analytics dashboards, improving decision speed by 30%.`
6. Click **Save Profile**
7. Select it as **Active Profile** in the popup

### Step 4: Test on Demo Page

1. Open `test-page.html` in Chrome (File → Open File)
2. The extension will automatically scan the form
3. You should see a **purple overlay panel** on the right side
4. It will show suggestions for each field with:
   - Confidence scores
   - Explanation of why it matched
   - Accept/Edit/Skip buttons
   - Save Mapping button

### Step 5: Try the Features

**Auto-Fill:**
- Click **"Accept"** on any suggestion to fill the field
- Click **"Accept All Safe Fields"** to fill all high-confidence fields at once
- Fields will be filled and highlighted in green

**Save Mapping:**
- Click **"💾 Save Mapping"** on any suggestion
- Reload the page
- The mapping will be auto-applied with 95% confidence

**Edit:**
- Click **"Edit"** to focus the field for manual editing
- The field will scroll into view

**History:**
- Fill some fields and submit the form
- Go to Options → History tab
- See your application submission history

### Step 6: Test Advanced Features

**Multi-Page Forms:**
- Fill some fields
- Navigate to another page (or use browser back)
- Return to the form
- Your filled values should be restored

**Shadow DOM:**
- Test on modern web apps (React, Vue, etc.)
- Extension should detect fields in Shadow DOM

**File Upload:**
- When a resume field is detected, you'll see a helper message
- Extension guides you to upload manually (browser security)

## What to Expect

### Overlay Panel
- **Green background**: High confidence (>85%), safe to auto-fill
- **Yellow background**: Sensitive field, requires review
- **Gray background**: Lower confidence, review before accepting

### Confidence Scores
- **90-100%**: Very confident match
- **60-89%**: Good match, review recommended
- **<60%**: Low confidence, manual review required

### Visual Feedback
- Fields flash **green border** when filled
- Overlay shows **count of suggestions**
- Each suggestion shows **source** (profile field or snippet)

## Troubleshooting

**Extension not loading?**
- Check `chrome://extensions/` for errors
- Ensure icons exist in `icons/` folder
- Verify `dist/` folder has compiled files

**No suggestions appearing?**
- Make sure a profile is set as active
- Check browser console (F12) for errors
- Verify the page has actual form elements

**Fields not filling?**
- Check console for JavaScript errors
- Try manually accepting suggestions first
- Verify selectors are working (inspect elements)

## Demo Checklist

- [ ] Extension loads without errors
- [ ] Can create a profile
- [ ] Profile appears in popup
- [ ] Can set profile as active
- [ ] Form fields detected on test page
- [ ] Suggestions appear in overlay
- [ ] Can accept individual suggestions
- [ ] Fields fill correctly
- [ ] "Accept All Safe Fields" works
- [ ] Save Mapping button works
- [ ] History tab shows submissions
- [ ] Multi-page state persists

## Next Steps

1. **Add LLM API** (Optional):
   - Go to Options → Advanced
   - Enable LLM API
   - Add your OpenAI API key
   - Get better matching with AI

2. **Add Embedding API** (Optional):
   - Enable Embedding API
   - Add API key
   - Better snippet matching

3. **Test on Real Sites**:
   - Try on actual job application sites
   - Save mappings for frequently used forms
   - Build up your profile library

Enjoy your demo! 🚀

