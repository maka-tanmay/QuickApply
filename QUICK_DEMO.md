# ⚡ Quick Demo - 5 Minutes

## 1. Build & Load (2 min)

```bash
# Already built! Just need icons
cd "/Users/tanmaymaka/Desktop/extension for job application"

# Create simple placeholder icons (or use real ones)
# The extension will work even with placeholder files
```

**Load in Chrome:**
1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select: `/Users/tanmaymaka/Desktop/extension for job application`

## 2. Create Profile (1 min)

1. Click **JobRight AI** icon in toolbar
2. Click **"Manage Profiles"**
3. Quick fill:
   - Name: `John Doe`
   - Email: `john@example.com`
   - Phone: `+1-555-0123`
   - Location: `San Francisco, CA`
4. Add field: `current_title` = `Software Engineer`
5. **Save** and set as **Active**

## 3. Test It! (2 min)

1. Open `test-page.html` in Chrome
2. **Watch the magic!** ✨
   - Purple overlay appears on right
   - Suggestions for each field
   - Click "Accept All Safe Fields"
   - Fields auto-fill!

## What You'll See

```
┌─────────────────────────────┐
│  JobRight AI          ×     │
│  8 suggestions found        │
│  • 5 safe to auto-fill      │
├─────────────────────────────┤
│  Full Name *                │
│  ✓ Matched profile field    │
│  John Doe                   │
│  Confidence: 90%            │
│  [Accept] [Edit] [Skip]     │
│  [💾 Save Mapping]           │
├─────────────────────────────┤
│  [Accept All Safe Fields]   │
│  [Hide Panel]               │
└─────────────────────────────┘
```

## Try These Features

✅ **Accept** - Fill individual field  
✅ **Accept All** - Fill all safe fields at once  
✅ **Save Mapping** - Remember this form pattern  
✅ **History** - See all filled applications  

## That's It! 🎉

The extension is working! Now you can:
- Test on real job sites
- Add more profiles
- Configure LLM API (optional)
- Build your mapping library

**Need help?** Check `DEMO.md` for detailed guide.

