const fs = require('fs');
const path = require('path');
const resedit = require('resedit');

async function stampIcon() {
  const exePath = path.join(__dirname, 'dist-bin', 'locallink-win.exe');
  const icoPath = path.join(__dirname, 'client', 'public', 'favicon.ico');

  if (!fs.existsSync(exePath)) {
    console.error('❌ Executable not found at dist-bin/locallink-win.exe. Skipping icon injection.');
    return;
  }

  if (!fs.existsSync(icoPath)) {
    console.error('❌ Icon not found at client/public/favicon.ico. Skipping icon injection.');
    return;
  }

  try {
    console.log('🎨 Stamping LocalLink icon onto Windows executable using resedit');
    const icoBuf = fs.readFileSync(icoPath);
    const icoFile = resedit.Data.IconFile.from(icoBuf);

    // Filter out uncompressed giant 256x256 bitmap frames (width === 0 in ICO header)
    // This ensures the icon fits comfortably inside the existing resource section
    const compactIco = new resedit.Data.IconFile();
    icoFile.icons.forEach((ic) => {
      if (ic.width !== 0) {
        compactIco.icons.push(ic);
      }
    });

    const exeBuf = fs.readFileSync(exePath);
    const exe = resedit.NtExecutable.from(exeBuf);
    const res = resedit.NtExecutableResource.from(exe);

    // Replace Icon Group ID 1 (default executable icon) with our custom compact icon frames
    resedit.Resource.IconGroupEntry.replaceIconsForResource(
      res.entries,
      1,
      1033,
      compactIco.icons.map((item) => item.data)
    );

    // Output with noGrow: true to prevent section expansion and protect pkg's appended Virtual File System payload
    res.outputResource(exe, { noGrow: true });
    const outBuf = Buffer.from(exe.generate());
    fs.writeFileSync(exePath, outBuf);

    console.log('✅ Successfully stamped LocalLink icon onto locallink-win.exe without corrupting pkg payload!');
    console.log('💡 Note: If Windows Explorer still shows the old icon, rename or move the file to clear Windows Icon Cache.');
  } catch (err) {
    console.error('❌ Failed to inject icon with resedit:', err.message);
  }
}

stampIcon();
