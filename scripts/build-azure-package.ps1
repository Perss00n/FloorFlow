#Requires -Version 5.1
# Local packaging only. Never reads .env/DPAPI or contacts Azure.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskBuild = Join-Path $taskRoot ('.tmp\deployment-' + [Guid]::NewGuid().ToString('N'))
$taskStage = Join-Path $taskBuild 'app'
New-Item -ItemType Directory -Path $taskStage | Out-Null
$taskFiles = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'deployment-files.json') | ConvertFrom-Json
foreach ($taskFile in $taskFiles) {
    $taskSource = [IO.Path]::GetFullPath((Join-Path $taskRoot $taskFile))
    if (-not $taskSource.StartsWith($taskRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or
        $taskFile -match '(^|/)(\.|node_modules|test|scripts|docs)' -or
        $taskFile -notmatch '\.(js|json|html|css|svg|sql)$') { throw 'Unexpected package source.' }
    # Refuse redirected files/directories inside the source tree.
    $taskItem = Get-Item -LiteralPath $taskSource
    while ($taskItem.FullName -ne $taskRoot) {
        if (($taskItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Redirected package source.' }
        $taskItem = if ($taskItem -is [IO.FileInfo]) { $taskItem.Directory } else { $taskItem.Parent }
    }
    $taskDestination = Join-Path $taskStage $taskFile
    New-Item -ItemType Directory -Path (Split-Path -Parent $taskDestination) -Force | Out-Null
    Copy-Item -LiteralPath $taskSource -Destination $taskDestination
}

# Use a local Linux/amd64 Node 24 image; never copy Windows node_modules.
$taskImage = & docker image inspect node:24-bookworm-slim --format '{{.Id}}'
if ($LASTEXITCODE -ne 0) { throw 'Install/review the local node:24-bookworm-slim image first.' }
# Only node src/server.js runs on the host; npm CLI symlinks are unnecessary and
# cannot be safely traversed by Windows ZipFile on a Docker Desktop bind mount.
& docker run --rm --pull=never --platform linux/amd64 --mount "type=bind,source=$taskStage,target=/app" --workdir /app $taskImage npm ci --omit=dev --ignore-scripts --bin-links=false --no-audit --no-fund --engine-strict
if ($LASTEXITCODE -ne 0) { throw 'Linux dependency installation failed. No package produced.' }
& docker run --rm --pull=never --network none --platform linux/amd64 --mount "type=bind,source=$taskStage,target=/app,readonly" --workdir /app $taskImage node --input-type=module -e "import {createApp} from './src/app.js'; import {configureAssistant} from './src/assistant/config.js'; if(configureAssistant({}).assistant!==null) process.exit(1); createApp({query:async()=>({rows:[]})}); console.log(process.version, process.platform, process.arch, 'runtime imports OK; AI disabled');"
if ($LASTEXITCODE -ne 0) { throw 'Linux runtime import check failed. No package produced.' }

$taskZip = Join-Path $taskBuild 'floorflow.zip'
[IO.Compression.ZipFile]::CreateFromDirectory($taskStage, $taskZip, [IO.Compression.CompressionLevel]::Optimal, $false)
$taskArchive = [IO.Compression.ZipFile]::OpenRead($taskZip)
try {
    $taskEntries = @($taskArchive.Entries | ForEach-Object { $_.FullName.Replace('\','/') })
    foreach ($taskEntry in $taskEntries) {
        # Vendor source modules can legitimately be named credentials.js; private
        # exported credential files (XML/JSON/text) are always rejected.
        if ($taskEntry -match '(^|/)(\.env[^/]*|\.git|\.npmrc|\.pgpass|\.azure)(/|$)|(^|/)[^/]*credential[^/]*\.(xml|json|txt|csv)$|\.pem$|\.key$|\.pfx$|\.log$' -or
            (-not $taskEntry.StartsWith('node_modules/') -and $taskEntry -notin $taskFiles)) {
            throw 'Unexpected archive entry. Do not deploy this package.'
        }
    }
    if (@($taskEntries | Where-Object { $_ -notlike 'node_modules/*' }).Count -ne $taskFiles.Count) { throw 'Package source list mismatch.' }
} finally { $taskArchive.Dispose() }
$taskHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $taskZip).Hash
# Evidence stays beside the ZIP, never inside it. No secrets or .git data are copied.
[PSCustomObject]@{ package = $taskZip; sha256 = $taskHash; linuxImage = $taskImage; sourceFiles = $taskFiles; entries = $taskEntries.Count } |
    ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $taskBuild 'package-report.json') -Encoding UTF8
Write-Output ('Package: ' + $taskZip)
Write-Output ('SHA256: ' + $taskHash)
