#Requires -Version 5.1
# Manual operator only. No Azure management commands, credential creation or .env loading.
[CmdletBinding()]
param([Parameter(Mandatory = $true)][ValidateSet('Check', 'Install', 'Verify')][string]$Mode)
$ErrorActionPreference = 'Stop'
$taskProcess = $null
$taskFailure = $false

function Assert-PrivatePath([string]$Path, [bool]$Directory = $false) {
    $taskItem = Get-Item -LiteralPath $Path -Force
    if (($taskItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Unexpected redirected path.' }
    $taskSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $taskAcl = Get-Acl -LiteralPath $Path
    if ($taskAcl.GetOwner([Security.Principal.SecurityIdentifier]) -ne $taskSid -or
        ($Directory -and -not $taskAcl.AreAccessRulesProtected)) { throw 'Unexpected private path owner or inheritance.' }
    foreach ($taskRule in $taskAcl.Access) {
        if ($taskRule.AccessControlType -eq 'Allow' -and
            $taskRule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]) -ne $taskSid) {
            throw 'Private path allows another principal.'
        }
    }
}

try {
    if ($env:OS -ne 'Windows_NT' -or @($args).Count -ne 0) { throw 'Windows DPAPI and a named mode are required.' }
    $taskRoot = Split-Path -Parent $PSScriptRoot
    $taskDirectory = Join-Path $env:LOCALAPPDATA 'FloorFlow\Azure'
    Assert-PrivatePath $taskDirectory $true
    $taskNode = (Get-Command node -CommandType Application -ErrorAction Stop).Source
    $taskInfo = New-Object System.Diagnostics.ProcessStartInfo
    $taskInfo.FileName = $taskNode
    $taskInfo.Arguments = 'scripts/bootstrap-azure-db.js ' + $Mode.ToLowerInvariant()
    $taskInfo.WorkingDirectory = $taskRoot
    $taskInfo.UseShellExecute = $false
    $taskInfo.CreateNoWindow = $true
    $taskInfo.RedirectStandardInput = $true
    $taskInfo.RedirectStandardOutput = $true
    $taskInfo.RedirectStandardError = $true
    foreach ($taskKey in @($taskInfo.EnvironmentVariables.Keys)) {
        if ($taskKey -like 'PG*' -or $taskKey -in @('NODE_OPTIONS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_EXTRA_CA_CERTS', 'SSLKEYLOGFILE')) {
            $taskInfo.EnvironmentVariables.Remove($taskKey)
        }
    }
    $taskCredentials = @{}
    $taskNames = @('admin')
    if ($Mode -ne 'Check') { $taskNames += @('app', 'ai') }
    foreach ($taskName in $taskNames) {
        $taskPath = Join-Path $taskDirectory ('pg-floorflow-demo-6e9587-' + $taskName + '.credential.xml')
        Assert-PrivatePath $taskPath
        $taskCredential = Import-Clixml -LiteralPath $taskPath
        if ($taskCredential -isnot [System.Management.Automation.PSCredential] -or
            $taskCredential.UserName -cne ('floorflow_' + $taskName)) { throw 'Unexpected credential identity.' }
        $taskCredentials[$taskName] = @{
            user = $taskCredential.UserName
            password = $taskCredential.GetNetworkCredential().Password
        }
    }
    $taskPayload = $taskCredentials | ConvertTo-Json -Compress
    $taskProcess = [System.Diagnostics.Process]::Start($taskInfo)
    $taskOutputTask = $taskProcess.StandardOutput.ReadToEndAsync()
    $taskErrorTask = $taskProcess.StandardError.ReadToEndAsync()
    $taskProcess.StandardInput.WriteLine($taskPayload)
    $taskProcess.StandardInput.Close()
    $taskPayload = $null
    $taskCredentials = $null
    $taskCredential = $null
    $taskProcess.WaitForExit()
    $taskOutput = $taskOutputTask.GetAwaiter().GetResult()
    $taskErrors = $taskErrorTask.GetAwaiter().GetResult()
    if ([string]::IsNullOrWhiteSpace($taskOutput) -or -not [string]::IsNullOrWhiteSpace($taskErrors)) {
        throw 'No clean report. Database outcome may be partial or unknown.'
    }
    $taskReport = $taskOutput | ConvertFrom-Json
    # The Node entry point emits only fixed metadata, booleans, numeric strings and safe codes.
    # CreateNew refuses even an accidental report-name collision; no credential is written.
    $taskReportPath = Join-Path $taskDirectory ('bootstrap-' + $Mode.ToLowerInvariant() + '-' + [Guid]::NewGuid().ToString('N') + '.json')
    $taskStream = [IO.File]::Open($taskReportPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
    try {
        $taskBytes = (New-Object Text.UTF8Encoding $false).GetBytes($taskOutput.Trim())
        $taskStream.Write($taskBytes, 0, $taskBytes.Length)
    } finally { $taskStream.Dispose() }
    Write-Output $taskOutput.Trim()
    Write-Host ('Sanitized report saved: ' + $taskReportPath)
    if ($taskProcess.ExitCode -ne 0 -or $taskReport.success -ne $true) { throw 'Operation failed.' }
} catch {
    # Never echo exception text: provider/credential errors can include sensitive context.
    $taskFailure = $true
} finally {
    $taskPayload = $null
    $taskCredentials = $null
    $taskCredential = $null
    if ($null -ne $taskProcess) {
        if (-not $taskProcess.HasExited) { $taskProcess.Kill(); $taskProcess.WaitForExit() }
        $taskProcess.Dispose()
    }
}
if ($taskFailure) {
    throw 'Operation stopped. Keep existing credentials and partial database state. Share only the sanitized report if available. Do not retry Install or delete objects before review. Remove only any separately approved temporary firewall rule. Logging must remain error; do not change it.'
}
