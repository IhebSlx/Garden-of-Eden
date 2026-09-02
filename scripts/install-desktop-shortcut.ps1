<#
  Puts a double-clickable shortcut on the Desktop that starts the app.

  Run once:
      powershell -ExecutionPolicy Bypass -File scripts\install-desktop-shortcut.ps1

  The shortcut points at the launcher in this repo rather than copying anything, so
  pulling a new version updates what the shortcut runs. Re-run this script only if
  the repo moves.
#>

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $repo 'scripts\Start Agent Visualiser.cmd'
$icon = Join-Path $repo 'public\app-icon.ico'
$link = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Solarlux Agent Visualiser.lnk'

foreach ($required in @($launcher, $icon)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Missing $required. Run 'node scripts/make-icons.mjs' and check out the whole repo."
    }
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($link)

# cmd.exe /c so the console closes cleanly when the server is stopped; the launcher
# path is quoted because it contains spaces.
$shortcut.TargetPath = "$env:ComSpec"
$shortcut.Arguments = "/c `"`"$launcher`"`""
$shortcut.WorkingDirectory = $repo
$shortcut.IconLocation = "$icon,0"
$shortcut.Description = 'Solarlux Agent Visualiser - the agent fleet overview'
$shortcut.WindowStyle = 7   # start minimised: the browser is the app, not the console
$shortcut.Save()

[Runtime.InteropServices.Marshal]::ReleaseComObject($shell) | Out-Null

Write-Host "Shortcut created:" -ForegroundColor Green
Write-Host "  $link"
Write-Host "  -> $launcher"
