# Debugging Scan Issues

## Quick Checklist

1. **Active Profile Selected?**
   - Open popup
   - Check if a profile is selected in dropdown
   - If not, select one

2. **Content Script Loaded?**
   - Open browser console (F12) on the test page
   - Look for "JobRight AI: Scanning for forms..."
   - If you don't see it, reload the page

3. **Form Fields Detected?**
   - Check console for: "JobRight AI: Found X form fields"
   - If 0 fields, the page might not have detectable forms

4. **Overlay Appearing?**
   - Should see purple panel on right side
   - If not, check console for errors

## Common Issues

### "No active profile"
**Fix:** Select a profile in the popup dropdown

### "Content script not loaded"
**Fix:** 
1. Reload the page
2. Check `chrome://extensions/` - extension should be enabled
3. Try clicking "Scan Current Page" button again

### "No form fields detected"
**Fix:**
- Make sure the page has actual `<input>`, `<textarea>`, or `<select>` elements
- Check if forms are in iframes (not supported yet)
- Try a different page

### Overlay not showing
**Fix:**
- Check browser console for errors
- Make sure profile has data (name, email, fields)
- Try manually clicking "Scan Current Page"

## Testing Steps

1. **Create Profile:**
   - Name: Test User
   - Email: test@example.com
   - Field: `current_title` = `Software Engineer`

2. **Set as Active:**
   - Popup → Select profile from dropdown

3. **Open Test Page:**
   - Open `test-page.html` in Chrome

4. **Scan:**
   - Click extension icon
   - Click "Scan Current Page"
   - OR wait for auto-scan (1 second delay)

5. **Check Console:**
   - Press F12
   - Look for JobRight AI messages
   - Should see form fields detected

6. **Fill Form:**
   - Overlay should appear
   - Click "Accept All Safe Fields"
   - Fields should fill

## Manual Test in Console

Open browser console on test page and run:

```javascript
// Check if content script is loaded
console.log('Content script check:', typeof chrome !== 'undefined');

// Manually trigger scan
chrome.runtime.sendMessage({type: 'scan'}, (response) => {
  console.log('Scan response:', response);
});
```


