const fs = require('fs');
const path = require('path');

const packageRoot = path.resolve(__dirname, '..');
const scriptsPackageDir = path.join(packageRoot, 'node_modules', 'expo-module-scripts');
const baseJsonPath = path.join(scriptsPackageDir, 'tsconfig.base.json');
const baseShimPath = path.join(scriptsPackageDir, 'tsconfig.base');

try {
  if (!fs.existsSync(scriptsPackageDir)) {
    process.exit(0);
  }

  if (!fs.existsSync(baseJsonPath)) {
    console.warn('[postinstall] expo-module-scripts tsconfig.base.json not found.');
    process.exit(0);
  }

  if (!fs.existsSync(baseShimPath)) {
    fs.writeFileSync(baseShimPath, '{"extends":"./tsconfig.base.json"}\n', 'utf8');
    console.log('[postinstall] Created expo-module-scripts/tsconfig.base shim.');
  }

  const expoPackages = ['expo-image-picker', 'expo-modules-core', 'expo-status-bar'];
  expoPackages.forEach((packageName) => {
    const tsConfigPath = path.join(packageRoot, 'node_modules', packageName, 'tsconfig.json');
    if (!fs.existsSync(tsConfigPath)) {
      return;
    }

    const raw = fs.readFileSync(tsConfigPath, 'utf8');
    const updated = raw.replace(
      '"expo-module-scripts/tsconfig.base"',
      '"expo-module-scripts/tsconfig.base.json"'
    );

    if (updated !== raw) {
      fs.writeFileSync(tsConfigPath, updated, 'utf8');
      console.log(`[postinstall] Patched ${packageName}/tsconfig.json extends path.`);
    }
  });
} catch (error) {
  console.warn('[postinstall] Unable to apply expo-module-scripts fix:', error.message);
}
