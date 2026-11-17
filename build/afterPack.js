// Stamps the Notify icon and version info into Notify.exe using a pure
// JavaScript resource editor, so Windows builds work from any OS.
const fs = require('fs');
const path = require('path');
const ResEdit = require('resedit');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const { productName, version } = context.packager.appInfo;
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);

  const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, 'icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const groupId = groups.length ? groups[0].id : 1;
  const lang = groups.length ? groups[0].lang : 1033;
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, groupId, lang, ico.icons.map((i) => i.data));

  const [vi] = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  if (vi) {
    const [a, b, c] = version.split('.').map((n) => parseInt(n, 10) || 0);
    vi.setFileVersion(a, b, c, 0);
    vi.setProductVersion(a, b, c, 0);
    const langs = vi.getAllLanguagesForStringValues();
    const target = langs[0] || { lang: 1033, codepage: 1200 };
    vi.setStringValues(target, {
      ProductName: productName,
      FileDescription: productName,
      CompanyName: productName,
      InternalName: productName,
      OriginalFilename: `${productName}.exe`,
      LegalCopyright: `Copyright © ${new Date().getFullYear()} ${productName}`,
      FileVersion: version,
      ProductVersion: version
    });
    vi.outputToResourceEntries(res.entries);
  }
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log(`  • stamped icon + version info into ${path.basename(exePath)}`);
};
