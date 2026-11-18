#Requires -Version 5.1
# Operator-run only: imports the saved credential and launches read-only inspection.
# This script never changes Azure firewall rules or server/database configuration.
$ErrorActionPreference = 'Stop'
$taskProcess = $null
$taskCredential = $null
$taskPayload = $null
try {
    if ($env:OS -ne 'Windows_NT') { throw 'Windows DPAPI is required.' }
    $taskRoot = Split-Path -Parent $PSScriptRoot
    $taskNode = (Get-Command node -CommandType Application -ErrorAction Stop).Source
    $taskCredentialPath = Join-Path $env:LOCALAPPDATA 'FloorFlow\Azure\pg-floorflow-demo-6e9587-admin.credential.xml'
    $taskCredential = Import-Clixml -LiteralPath $taskCredentialPath
    if ($taskCredential -isnot [System.Management.Automation.PSCredential] -or $taskCredential.UserName -cne 'floorflow_admin') {
        throw 'Unexpected credential type or username.'
    }

    $taskInfo = New-Object System.Diagnostics.ProcessStartInfo
    $taskInfo.FileName = $taskNode
    $taskInfo.Arguments = 'scripts/inspect-azure-db.js'
    $taskInfo.WorkingDirectory = $taskRoot
    $taskInfo.UseShellExecute = $false
    $taskInfo.CreateNoWindow = $true
    $taskInfo.RedirectStandardInput = $true
    $taskInfo.RedirectStandardOutput = $true
    $taskInfo.RedirectStandardError = $true
    # Isolate this child from local PostgreSQL settings and Node preload/TLS overrides.
    foreach ($taskKey in @($taskInfo.EnvironmentVariables.Keys)) {
        if ($taskKey -like 'PG*' -or $taskKey -in @('NODE_OPTIONS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_EXTRA_CA_CERTS', 'SSLKEYLOGFILE')) {
            $taskInfo.EnvironmentVariables.Remove($taskKey)
        }
    }
    $taskPayload = @{
        user = $taskCredential.UserName
        password = $taskCredential.GetNetworkCredential().Password
    } | ConvertTo-Json -Compress
    $taskProcess = [System.Diagnostics.Process]::Start($taskInfo)
    $taskOutputTask = $taskProcess.StandardOutput.ReadToEndAsync()
    $taskErrorTask = $taskProcess.StandardError.ReadToEndAsync()
    # An anonymous stdin pipe: no password argument, environment variable or file.
    $taskProcess.StandardInput.WriteLine($taskPayload)
    $taskProcess.StandardInput.Close()
    $taskPayload = $null
    $taskCredential = $null
    $taskProcess.WaitForExit()
    $taskOutput = $taskOutputTask.GetAwaiter().GetResult()
    $taskErrors = $taskErrorTask.GetAwaiter().GetResult()
    if ([string]::IsNullOrWhiteSpace($taskOutput) -or -not [string]::IsNullOrWhiteSpace($taskErrors)) {
        throw 'The client did not produce a clean inspection report.'
    }
    $taskReport = $taskOutput | ConvertFrom-Json
    Write-Output $taskOutput.Trim()
    if ($taskProcess.ExitCode -ne 0 -or $taskReport.success -ne $true) {
        throw 'Inspection failed; use the sanitized report code.'
    }
} catch {
    # Never echo raw errors, credentials, child stderr or the JSON input.
    Write-Error 'Inspection did not complete. Remove the temporary firewall rule, then follow the runbook error guidance. Do not share raw errors or credentials.'
} finally {
    $taskPayload = $null
    $taskCredential = $null
    if ($null -ne $taskProcess) { $taskProcess.Dispose() }
}
