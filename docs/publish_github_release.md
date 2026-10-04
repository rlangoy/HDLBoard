# Publisere en GitHub-release

En **GitHub-release** er en versjon av HDLBoard som er knyttet til en git-tag
(f.eks. `v1.2.4`). Den har en releasetekst og nedlastbare filer, og vises under
[Releases](https://github.com/rlangoy/HDLBoard/releases).

Windows-installeren (`HDLBoard-Setup-<versjon>.exe`) bygges automatisk av
GitHub Actions ([`.github/workflows/build-windows.yml`](../.github/workflows/build-windows.yml))
hver gang en tag som starter med `v` pushes:

- Versjonen hentes fra taggen (`v1.2.4` blir `1.2.4`) og skrives inn i alle
  `package.json` før bygget. Dermed får installeren, appen og About-dialogen
  samme versjon. Endringen skjer bare på build-maskinen og blir ikke committet.
- `winInstaller\build.ps1` bygger installeren, på samme måte som lokalt
  (se [winInstaller/README.md](../winInstaller/README.md)).
- Finnes ikke releasen fra før, lages den som **draft** med installeren vedlagt.
  Er det en bindestrek i versjonen (f.eks. `-rc.1`), merkes den som pre-release.
  Finnes releasen allerede, lastes bare `.exe`-filen opp til den.

## Slik lager du en test- eller draft-release

**Test-release (draft pre-release):**

```powershell
git tag v1.2.4-rc.1
git push origin v1.2.4-rc.1
```

Etter cirka 3 minutter ligger draften under **Releases** med installeren vedlagt.
Draften er bare synlig for deg.

**Slette testen etterpå:**

```powershell
gh release delete v1.2.4-rc.1 --cleanup-tag --yes
```

**Ekte release:**

```powershell
npm run version:bump -- 1.2.4    # + linje i docs/changelog.txt, commit, push
git tag v1.2.4
git push origin v1.2.4
```

Gå deretter til **Releases**, se over draften, rediger teksten og trykk
**Publish release**.

**Bygge uten release:** gå til **Actions**, velg "Build Windows installer" og
trykk **Run workflow**. Installeren lastes da bare ned som artifact.

En ting å vite: hvis du lager en draft i GitHub-grensesnittet
("Draft a new release"), lages ikke taggen før du publiserer. Bygget starter
derfor først når du trykker **Publish release**, og da legges `.exe`-filen til
releasen som allerede er publisert.
