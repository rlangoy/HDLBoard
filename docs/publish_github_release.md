# Publishing a GitHub release

A **GitHub release** is a version of HDLBoard tied to a git tag (e.g. `v1.2.4`).
It has release notes and downloadable files, and is listed under
[Releases](https://github.com/rlangoy/HDLBoard/releases).

The Windows installer (`HDLBoard-Setup-<version>.exe`) is built automatically by
GitHub Actions ([`.github/workflows/build-windows.yml`](../.github/workflows/build-windows.yml))
every time a tag starting with `v` is pushed:

- The version is taken from the tag (`v1.2.4` becomes `1.2.4`) and written into
  every `package.json` before the build, so the installer, the app and the About
  dialog all show the same version. This change happens on the build machine
  only and is never committed.
- `winInstaller\build.ps1` builds the installer, the same way as locally
  (see [winInstaller/README.md](../winInstaller/README.md)).
- If the release does not exist yet, it is created as a **draft** with the
  installer attached. If the version contains a hyphen (e.g. `-rc.1`), it is
  marked as a pre-release. If the release already exists, only the `.exe` file
  is uploaded to it.

## Creating a test or draft release

**Test release (draft pre-release):**

```powershell
git tag v1.2.4-rc.1
git push origin v1.2.4-rc.1
```

After about 3 minutes the draft appears under **Releases** with the installer
attached. Drafts are visible only to you.

**Deleting the test afterwards:**

```powershell
gh release delete v1.2.4-rc.1 --cleanup-tag --yes
```

**Real release:**

```powershell
npm run version:bump -- 1.2.4    # + a line in docs/changelog.txt, commit, push
git tag v1.2.4
git push origin v1.2.4
```

Then go to **Releases**, review the draft, edit the notes and press
**Publish release**.

**Building without a release:** go to **Actions**, choose "Build Windows
installer" and press **Run workflow**. The installer is then only available for
download as an artifact.

One thing to know: if you create a draft in the GitHub web interface
("Draft a new release"), the tag is not created until you publish. The build
therefore starts only when you press **Publish release**, and the `.exe` file is
then added to the already published release.
