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
