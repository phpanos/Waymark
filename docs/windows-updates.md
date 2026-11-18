# Windows alpha updates

Waymark checks a public GitHub update feed from the Settings window. It verifies the downloaded NSIS installer against the Tauri public key embedded in the signed build. Windows runs the installer and relaunches Waymark when the user chooses **Install and restart**.

## Set up signing

Use a dedicated Tauri signing key and keep a private backup. If the key is lost or compromised, installed copies need a new manual installer to trust a replacement key.

```powershell
npm ci
npm run tauri -- signer generate -w "$env:USERPROFILE\.waymark-update.key"
```

In the repository's [Actions secrets and variables](https://github.com/phpanos/Waymark/settings/secrets/actions), set these entries using the full file contents.

| Name | Kind | Value |
| --- | --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Secret | Contents of `waymark-update.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Secret | Password for the private key, if set |
| `WAYMARK_UPDATER_PUBLIC_KEY` | Variable | Contents of `waymark-update.key.pub` |

## Publish

Use a new numeric version in `src-tauri/tauri.conf.json`, the `waymark` Cargo package and its lockfile entry, and the npm package and lockfile. Push to `main` to trigger **Publish signed Windows alpha** in GitHub Actions. If the checked-in version is newer than the update feed, the workflow builds and tests the installer, publishes an alpha release, and advances the feed.

You can still run **Publish signed Windows alpha** manually from `main` to supply a Windows validation run ID. Rerun the original workflow if it uploaded the installer but did not advance the feed.

Run **Windows validation** with **Install and verify a signed in-app upgrade** enabled to test the update flow with a disposable key and local update server. The test installs the current build, accepts an update in Settings, and verifies that Waymark restarts at the newer version with its saved settings intact.
