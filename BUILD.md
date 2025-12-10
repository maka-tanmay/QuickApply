# Build Instructions

## Prerequisites

- Node.js 16+ and npm
- Chrome browser (for testing)

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the extension:**
   ```bash
   npm run build
   ```

   This will:
   - Compile TypeScript files from `src/` to `dist/`
   - Copy assets to `dist/`

3. **Load in Chrome:**
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select this directory

## Development Workflow

For active development with auto-rebuild:

```bash
npm run watch
```

This will watch for file changes and rebuild automatically. You'll need to reload the extension in Chrome after each rebuild.

## Project Structure After Build

```
.
├── dist/
│   ├── background.js      # Compiled service worker
│   ├── content.js         # Compiled content script
│   └── icons/             # Icon files
├── src/                   # TypeScript source files
├── popup.html/js          # Popup UI (not compiled)
├── options.html/js        # Options page (not compiled)
└── manifest.json          # Extension manifest
```

## Troubleshooting

### Build Errors

- **TypeScript errors**: Check `tsconfig.json` and ensure all types are correct
- **Module resolution**: Ensure all imports use correct paths
- **Missing files**: Run `npm install` to ensure all dependencies are installed

### Runtime Errors

- **Extension not loading**: Check Chrome's extension error page (`chrome://extensions/`)
- **Content script not running**: Check console for errors, verify manifest permissions
- **Storage not working**: Ensure IndexedDB is available (not in incognito mode by default)

### Testing

1. Create a test HTML page with forms
2. Load the extension
3. Create a profile in the options page
4. Navigate to your test page
5. Check the browser console for any errors
6. Verify the overlay appears and suggestions work

## Production Build

For production, you may want to:

1. Minify JavaScript (add a minification step)
2. Optimize images
3. Remove source maps
4. Add version numbers to manifest

Example minification setup:

```bash
npm install --save-dev terser
```

Then add to `package.json`:
```json
"scripts": {
  "build:prod": "tsc && terser dist/*.js -o dist/*.js --compress --mangle"
}
```

