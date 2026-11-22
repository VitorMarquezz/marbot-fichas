// Coloca o ícone e o nome no .exe (sem precisar de Wine ao gerar o instalador fora do Windows).
const fs = require('node:fs');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const ResEdit = await import('resedit');
  const R = ResEdit.default || ResEdit;
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const icoPath = path.join(context.packager.projectDir, 'build', 'icon.ico');

  const exe = R.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = R.NtExecutableResource.from(exe);

  const iconFile = R.Data.IconFile.from(fs.readFileSync(icoPath));
  const groups = R.Resource.IconGroupEntry.fromEntries(res.entries);
  const id = groups[0]?.id ?? 1;
  const lang = groups[0]?.lang ?? 1033;
  R.Resource.IconGroupEntry.replaceIconsForResource(res.entries, id, lang, iconFile.icons.map((i) => i.data));

  const [vi] = R.Resource.VersionInfo.fromEntries(res.entries);
  if (vi) {
    const version = context.packager.appInfo.version;
    for (const l of vi.getAllLanguagesForStringValues()) {
      vi.setStringValues(l, {
        ProductName: 'Marbot Fichas',
        FileDescription: 'Marbot Fichas',
        CompanyName: 'Marbot Ateliê',
        LegalCopyright: 'Marbot Ateliê',
        OriginalFilename: 'Marbot Fichas.exe',
        InternalName: 'Marbot Fichas',
        ProductVersion: version,
        FileVersion: version,
      });
    }
    const [a, b, c] = version.split('.').map(Number);
    vi.setFileVersion(a, b, c, 0);
    vi.setProductVersion(a, b, c, 0);
    vi.outputToResourceEntries(res.entries);
  }

  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log('  • ícone e nome aplicados ao', path.basename(exePath));
};
