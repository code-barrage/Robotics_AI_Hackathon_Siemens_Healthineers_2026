$ErrorActionPreference = "Stop"

$androidDir = (Resolve-Path (Join-Path $PSScriptRoot "..\android")).Path
$outputDir = Join-Path $androidDir "app\build\outputs\apk"
$javaCandidates = @()
if ($env:JAVA_HOME) {
  $javaCandidates += $env:JAVA_HOME
}
foreach ($jdkRoot in @(
  (Join-Path $env:LOCALAPPDATA "Programs\Eclipse Adoptium"),
  "C:\Program Files\Eclipse Adoptium",
  (Join-Path $env:USERPROFILE ".jdks")
)) {
  if (Test-Path $jdkRoot) {
    $javaCandidates += Get-ChildItem $jdkRoot -Directory |
      Where-Object { $_.Name -match "jdk-17|jdk-21|jbr-21" } |
      Select-Object -ExpandProperty FullName
  }
}

$javaHome = $null
foreach ($candidate in ($javaCandidates | Select-Object -Unique)) {
  $javaRelease = Join-Path $candidate "release"
  if (-not (Test-Path (Join-Path $candidate "bin\java.exe")) -or -not (Test-Path $javaRelease)) {
    continue
  }
  $versionLine = Get-Content -LiteralPath $javaRelease | Select-String '^JAVA_VERSION=' | Select-Object -First 1
  if ($versionLine -and $versionLine.Line -match '^JAVA_VERSION="([^"]+)"$') {
    $version = $Matches[1]
    $majorVersion = [int]($version.Split(".")[0])
    if ($majorVersion -eq 17 -or $majorVersion -eq 21) {
      $javaHome = $candidate
      break
    }
  }
}
if (-not $javaHome) {
  throw "Install JDK 17 or 21, or set JAVA_HOME to one, before building the Android APKs."
}

$env:JAVA_HOME = $javaHome
$env:PATH = "$(Join-Path $javaHome 'bin');$env:PATH"
$gradle = Join-Path $androidDir "gradlew.bat"

Push-Location $androidDir
try {
  & $gradle --no-daemon assembleRelease
  if ($LASTEXITCODE -ne 0) {
    throw "APK build failed with exit code $LASTEXITCODE."
  }

  $apk = Get-ChildItem (Join-Path $outputDir "release") -Filter "*.apk" | Select-Object -First 1
  if (-not $apk) {
    throw "Gradle succeeded but did not produce the release APK."
  }
  Copy-Item -LiteralPath $apk.FullName -Destination (Join-Path $outputDir "ACU-Robot-Siemens-Petrol.apk") -Force
} finally {
  Pop-Location
}
