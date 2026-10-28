# Desktop packages

Glowstone is built with [Tauri 2](https://tauri.app/). The Linux bundles are
produced with:

```bash
npm ci
npm run tauri build -- --bundles appimage,deb,rpm
```

Artifacts:

- `src-tauri/target/release/bundle/appimage/Glowstone_0.1.0_amd64.AppImage`
- `src-tauri/target/release/bundle/deb/Glowstone_0.1.0_amd64.deb`
- `src-tauri/target/release/bundle/rpm/Glowstone-0.1.0-1.x86_64.rpm`

## Windows

The `.exe` installer is an NSIS bundle and has to be built on Windows (Tauri's
Windows bundler depends on the MSVC toolchain and Windows SDK):

```powershell
npm ci
npm run tauri build -- --bundles nsis
# src-tauri/target/release/bundle/nsis/Glowstone_0.1.0_x64-setup.exe
```

The included GitHub Actions workflow (`.github/workflows/release.yml`) builds
both the Linux packages and the Windows `.exe` on every `v*` tag or manually
from the Actions tab.

## Android

The Android build uses Tauri's mobile target. It expects a JDK 21, the Android
SDK (platform 35+) and NDK 27:

```bash
export JAVA_HOME="$HOME/jdk21"
export ANDROID_HOME="$HOME/android-sdk"
export NDK_HOME="$ANDROID_HOME/ndk/27.2.12479018"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

npm ci
npx tauri android init
npx tauri android build --apk --target aarch64 armv7 x86_64
```

The output is an unsigned APK. Sign it for sideloading with your own keystore:

```bash
"$ANDROID_HOME/build-tools/36.0.0/apksigner" sign \
  --ks ~/.android/debug.keystore \
  --ks-pass pass:android --key-pass pass:android \
  --ks-key-alias androiddebugkey \
  --out Glowstone-0.1.0-android.apk \
  app-universal-release-unsigned.apk
```

On first launch the Android app creates a private vault inside its app data
directory, so it works without broad storage permissions. The desktop folder
picker and installer-based import flow are hidden on mobile.
