const { rcedit } = require('rcedit');
const path = require('path');
const fs = require('fs');

async function run() {
  const exePath = path.join(__dirname, 'dist-bin', 'locallink-win.exe');
  const iconPath = path.join(__dirname, 'client', 'public', 'favicon.ico');

  if (!fs.existsSync(exePath)) {
    console.error('Executable not found. Skipping icon injection.');
    return;
  }

  if (!fs.existsSync(iconPath)) {
    console.error('Icon not found. Skipping icon injection.');
    return;
  }

  try {
    await rcedit(exePath, {
      icon: iconPath
    });
    console.log('✅ Successfully injected icon into locallink-win.exe');
  } catch (err) {
    console.error('Failed to inject icon:', err);
  }
}

run();
