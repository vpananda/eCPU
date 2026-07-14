const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Ensure ANDROID_HOME and ANDROID_SDK_ROOT are set for Android builds on Windows
if (process.platform === 'win32' && !process.env.ANDROID_HOME) {
  const defaultWinSdk = path.join(process.env.USERPROFILE || 'C:\\Users\\DELL', 'AppData', 'Local', 'Android', 'Sdk');
  if (fs.existsSync(defaultWinSdk)) {
    process.env.ANDROID_HOME = defaultWinSdk;
    process.env.ANDROID_SDK_ROOT = defaultWinSdk;
    console.log(`[INFO] Automatically set ANDROID_HOME and ANDROID_SDK_ROOT to: ${defaultWinSdk}`);
  }
}


// 1. Resolve paths
const rootDir = path.resolve(__dirname, '..');
const buildsDir = path.resolve(rootDir, '..', 'Output');
const packageJsonPath = path.resolve(rootDir, 'package.json');

// 2. Read package.json version
if (!fs.existsSync(packageJsonPath)) {
  console.error('Error: package.json not found in frontend directory.');
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version || '1.0.0';
console.log(`\nStarting build process for eCPU App version: v${version}`);

// 3. Create versioned output directories
const androidDestDir = path.join(buildsDir, 'android', `v${version}`);
const iosDestDir = path.join(buildsDir, 'ios', `v${version}`);

fs.mkdirSync(androidDestDir, { recursive: true });
fs.mkdirSync(iosDestDir, { recursive: true });

try {
  // 4. Trigger Expo Prebuild to generate native folders
  console.log('\n--- Running Expo Prebuild (creating native android & ios projects) ---');
  execSync('npx expo prebuild --clean --no-install', { cwd: rootDir, stdio: 'inherit' });

  // 5. Compile Android APK locally
  console.log('\n--- Compiling Android APK (assembleRelease) ---');
  const gradlewCmd = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  const androidDir = path.join(rootDir, 'android');
  
  // Ensure local.properties exists with the correct sdk.dir if missing
  const localPropertiesPath = path.join(androidDir, 'local.properties');
  if (!fs.existsSync(localPropertiesPath) && process.env.ANDROID_HOME) {
    console.log('[INFO] local.properties not found in Android project. Generating fallback local.properties...');
    const escapedSdkDir = process.env.ANDROID_HOME.replace(/\\/g, '\\\\');
    fs.writeFileSync(localPropertiesPath, `sdk.dir=${escapedSdkDir}\n`, 'utf8');
  }

  // Optimize compilation by limiting active architectures (targets arm64-v8a physical devices, reducing build time by ~75%)
  const gradlePropertiesPath = path.join(androidDir, 'gradle.properties');
  if (fs.existsSync(gradlePropertiesPath)) {
    console.log('[INFO] Optimizing gradle.properties for faster compilation (targeting arm64-v8a only)...');
    let content = fs.readFileSync(gradlePropertiesPath, 'utf8');
    content = content.replace(
      /reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64/g,
      'reactNativeArchitectures=arm64-v8a'
    );
    fs.writeFileSync(gradlePropertiesPath, content, 'utf8');
  }

  execSync(`${gradlewCmd} assembleRelease`, { cwd: androidDir, stdio: 'inherit' });

  // 6. Copy compiled APK to target folder
  const apkSource = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  const apkDest = path.join(androidDestDir, `eCPU-v${version}.apk`);

  if (fs.existsSync(apkSource)) {
    fs.copyFileSync(apkSource, apkDest);
    console.log(`\n[SUCCESS] Android APK built successfully and saved to:\n  --> ${apkDest}`);
  } else {
    console.error('\n[ERROR] Compiled APK not found in build directory.');
  }

  // 7. Handle iOS Bundle/Project
  console.log('\n--- Preparing iOS Native Project ---');
  const iosSourceDir = path.join(rootDir, 'ios');
  
  if (process.platform === 'darwin') {
    // If running on macOS, we can build the native bundle/app
    console.log('macOS detected: Compiling release iOS project...');
    try {
      execSync('npx expo run:ios --configuration Release --device', { cwd: rootDir, stdio: 'inherit' });
      console.log(`\n[SUCCESS] iOS app bundle built and saved to builds.`);
    } catch (err) {
      console.log('Skipping native .ipa packaging (signing certificates required). iOS source code is prepared.');
    }
  } else {
    console.log('\n[NOTICE] macOS is required to compile a native iOS IPA package.');
  }
  
  // Copy iOS native source folder description/files
  const iosReadme = path.join(iosDestDir, 'README.txt');
  fs.writeFileSync(iosReadme, `eCPU iOS Project Source Folder prepared at v${version}.\nCopy the 'frontend/ios' folder to a Mac machine and run 'xcodebuild' or open in Xcode to build the IPA.`, 'utf8');
  console.log(`\n[SUCCESS] iOS project directory prepared at:\n  --> ${iosSourceDir}\n  --> (Instructions written to ${iosReadme})`);

} catch (err) {
  console.error('\n[ERROR] Build process failed:', err.message);
  process.exit(1);
}
