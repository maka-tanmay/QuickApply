#!/usr/bin/env node

// Simple build verification script

const fs = require('fs');
const path = require('path');

const requiredFiles = [
  'dist/background.js',
  'dist/content.js',
  'manifest.json',
  'popup.html',
  'popup.js',
  'options.html',
  'options.js'
];

const requiredIcons = [
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png'
];

console.log('🔍 Verifying build...\n');

let errors = [];
let warnings = [];

// Check required files
requiredFiles.forEach(file => {
  if (!fs.existsSync(file)) {
    errors.push(`❌ Missing: ${file}`);
  } else {
    console.log(`✅ Found: ${file}`);
  }
});

// Check icons (warnings, not errors)
requiredIcons.forEach(icon => {
  if (!fs.existsSync(icon)) {
    warnings.push(`⚠️  Missing icon: ${icon} (extension will work but may show default icon)`);
  } else {
    console.log(`✅ Found: ${icon}`);
  }
});

// Check dist folder
if (!fs.existsSync('dist')) {
  errors.push('❌ dist/ folder not found. Run: npm run build');
} else {
  console.log('✅ dist/ folder exists');
}

// Summary
console.log('\n' + '='.repeat(50));
if (errors.length === 0 && warnings.length === 0) {
  console.log('✅ Build verification passed!');
  console.log('\nNext steps:');
  console.log('1. Load extension in Chrome (chrome://extensions/)');
  console.log('2. Create a profile in the options page');
  console.log('3. Test on test-page.html or a real job site');
  process.exit(0);
} else {
  if (errors.length > 0) {
    console.log('\n❌ ERRORS:');
    errors.forEach(e => console.log('  ' + e));
  }
  if (warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    warnings.forEach(w => console.log('  ' + w));
  }
  console.log('\n💡 Fix the errors above and run: npm run build');
  process.exit(errors.length > 0 ? 1 : 0);
}

