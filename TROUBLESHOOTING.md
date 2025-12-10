# Troubleshooting Guide

## Extension Not Working - Profile Creation Issues

### Common Issues & Fixes

#### 1. **Profile Not Saving**

**Symptoms:**
- Click "Save Profile" but nothing happens
- No error message shown
- Profile doesn't appear in list

**Solutions:**
1. **Open Browser Console** (F12 or Cmd+Option+I)
   - Go to Console tab
   - Look for red error messages
   - Share the error with developer

2. **Check Extension Background:**
   - Go to `chrome://extensions/`
   - Find "JobRight AI"
   - Click "service worker" link (if available)
   - Check for errors in console

3. **Reload Extension:**
   - Go to `chrome://extensions/`
   - Click reload icon on JobRight AI
   - Try creating profile again

4. **Clear and Reinstall:**
   - Remove extension
   - Reload the extension folder
   - This resets the database

#### 2. **Database Errors**

**Symptoms:**
- "IndexedDB" errors in console
- "Database not initialized" errors

**Solutions:**
1. **Check Permissions:**
   - Extension needs storage permission
   - Check `manifest.json` has `"storage"` permission

2. **Clear Extension Data:**
   - Go to `chrome://extensions/`
   - Click "Details" on JobRight AI
   - Click "Clear storage"
   - Reload extension

#### 3. **Message Passing Errors**

**Symptoms:**
- "Could not establish connection" errors
- Background script not responding

**Solutions:**
1. **Check Background Script:**
   - Open `chrome://extensions/`
   - Click "service worker" link
   - Check if it's running
   - Look for errors

2. **Verify Manifest:**
   - Ensure `manifest.json` is valid
   - Check `service_worker` path is correct

#### 4. **Form Validation Issues**

**Symptoms:**
- Can't submit form
- Required fields not recognized

**Solutions:**
1. **Fill Required Fields:**
   - Name and Email are required
   - Other fields are optional

2. **Check Form HTML:**
   - Ensure form has proper IDs
   - Check browser console for errors

## Debugging Steps

### Step 1: Check Console
```javascript
// Open browser console (F12)
// Look for errors starting with "JobRight AI:"
```

### Step 2: Test Database
```javascript
// In browser console on options page:
chrome.runtime.sendMessage({type: 'getAllProfiles'})
  .then(console.log)
  .catch(console.error);
```

### Step 3: Test Background Script
```javascript
// In service worker console:
// Should see "JobRight AI: Database initialized"
```

### Step 4: Verify Storage
- Open DevTools → Application tab
- Check IndexedDB → JobRightAI
- Should see "profiles", "mappings", "logs", "settings" stores

## Quick Fixes

### Fix 1: Reload Everything
1. Close all extension pages (popup, options)
2. Go to `chrome://extensions/`
3. Click reload on JobRight AI
4. Open options page again
5. Try creating profile

### Fix 2: Reset Database
1. Open DevTools (F12)
2. Go to Application tab
3. IndexedDB → JobRightAI
4. Right-click → Delete database
5. Reload extension
6. Try again

### Fix 3: Check File Permissions
```bash
# Ensure all files are readable
chmod -R 755 "/Users/tanmaymaka/Desktop/extension for job application"
```

## Still Not Working?

1. **Check Build:**
   ```bash
   npm run build
   ```
   Should complete without errors

2. **Verify Files:**
   - `dist/background.js` exists
   - `dist/content.js` exists
   - `manifest.json` is valid

3. **Check Manifest:**
   - Open `manifest.json`
   - Verify all paths are correct
   - Check permissions are set

4. **Report Issue:**
   - Open browser console
   - Copy all error messages
   - Note what you were doing when error occurred

## Expected Behavior

### When Working Correctly:

1. **Creating Profile:**
   - Fill form → Click Save
   - See "Profile saved successfully!" alert
   - Profile appears in list
   - Can set as active

2. **Loading Profiles:**
   - Options page loads
   - Profiles appear in list
   - No errors in console

3. **Saving Settings:**
   - Changes save immediately
   - Persist across reloads

## Need More Help?

Check the browser console for detailed error messages. Most issues will show up there with helpful error text.

