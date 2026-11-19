#Requires -Version 5.1
# PREPARED ONLY. Running with -Apply changes the existing app settings and restarts the app.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][Guid]$SubscriptionId,
    [Parameter(Mandatory = $true)][System.Management.Automation.PSCredential]$PreviewCredential,
    [string]$TrustedProxy = 'false',
    [switch]$DiagnoseProxy,
    [switch]$Apply
)
$ErrorActionPreference = 'Stop'
if (-not $Apply) { throw 'Preparation only. Run with -Apply only after explicit approval of the operator guide.' }
$taskStage = 'local_validation'
$taskHttp = $null
$taskToken = $null
$taskSettings = $null
$taskPassword = $null
$taskPreviewPassword = $null

function Assert-PrivateCredentialPath([string]$Path, [bool]$Directory = $false) {
    $taskItem = Get-Item -LiteralPath $Path -Force
    $taskSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $taskAcl = Get-Acl -LiteralPath $Path
    if (($taskItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
        $taskAcl.GetOwner([Security.Principal.SecurityIdentifier]) -ne $taskSid -or
        ($Directory -and -not $taskAcl.AreAccessRulesProtected)) { throw 'Unexpected credential path protection.' }
    foreach ($taskRule in $taskAcl.Access) {
        if ($taskRule.AccessControlType -eq 'Allow' -and
            $taskRule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]) -ne $taskSid) { throw 'Credential access is not private.' }
    }
}

try {
    if ($env:OS -ne 'Windows_NT') { throw 'Windows DPAPI is required.' }
    if ($TrustedProxy -in @('false','loopback')) {
        $TrustedProxy = $TrustedProxy.ToLowerInvariant()
    } else {
        $taskAddress = $null
        if (-not [Net.IPAddress]::TryParse($TrustedProxy, [ref]$taskAddress) -or
            $taskAddress.ToString() -ne $TrustedProxy) { throw 'Use one observed canonical proxy IP, loopback if proved, or false.' }
    }
    $taskPreviewPassword = $PreviewCredential.GetNetworkCredential().Password
    if ($PreviewCredential.UserName -notmatch '^[A-Za-z0-9._-]{1,64}$' -or
        $PreviewCredential.UserName -in @('floorflow_admin','floorflow_app','floorflow_ai') -or
        [string]::IsNullOrWhiteSpace($taskPreviewPassword) -or $taskPreviewPassword.Length -lt 24 -or $taskPreviewPassword.Length -gt 256 -or
        $taskPreviewPassword -match '[\x00-\x1f\x7f]') { throw 'Use a separate preview identity and a strong password of 24-256 characters.' }
    $taskDirectory = Join-Path $env:LOCALAPPDATA 'FloorFlow\Azure'
    Assert-PrivateCredentialPath $taskDirectory $true
    $taskPath = Join-Path $taskDirectory 'pg-floorflow-demo-6e9587-app.credential.xml'
    Assert-PrivateCredentialPath $taskPath
    $taskCredential = Import-Clixml -LiteralPath $taskPath
    if ($taskCredential -isnot [System.Management.Automation.PSCredential] -or
        $taskCredential.UserName -cne 'floorflow_app') { throw 'Unexpected database credential identity.' }
    $taskPassword = $taskCredential.GetNetworkCredential().Password
    if (-not $taskPassword -or $taskPassword -ceq $taskPreviewPassword) { throw 'Preview and database passwords must be separate.' }

    # Only the short-lived Entra token is returned by CLI, captured in memory.
    # No secrets are passed in process arguments or written to files.
    $taskStage = 'entra_authentication'
    $taskToken = & az account get-access-token --subscription $SubscriptionId.ToString() --resource https://management.azure.com/ --query accessToken --output tsv --only-show-errors 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $taskToken) { throw 'Microsoft Entra authentication failed.' }
    Add-Type -AssemblyName System.Net.Http
    $taskHandler = New-Object Net.Http.HttpClientHandler
    $taskHandler.AllowAutoRedirect = $false
    $taskHttp = New-Object Net.Http.HttpClient $taskHandler
    $taskHttp.Timeout = [TimeSpan]::FromSeconds(60)
    $taskHttp.DefaultRequestHeaders.Authorization = New-Object Net.Http.Headers.AuthenticationHeaderValue 'Bearer', $taskToken
    $taskBase = 'https://management.azure.com/subscriptions/' + $SubscriptionId.ToString() + '/resourceGroups/rg-floorflow-demo/providers/Microsoft.Web/sites/app-floorflow-demo-6e9587/config/appsettings'

    function Invoke-SettingsRequest([string]$Method, [string]$Suffix, [string]$Json = '') {
        $taskRequest = New-Object Net.Http.HttpRequestMessage (New-Object Net.Http.HttpMethod $Method), ($taskBase + $Suffix + '?api-version=2025-03-01')
        if ($Json) { $taskRequest.Content = New-Object Net.Http.StringContent $Json, ([Text.Encoding]::UTF8), 'application/json' }
        $taskResponse = $null
        try {
            $taskResponse = $taskHttp.SendAsync($taskRequest).GetAwaiter().GetResult()
            if (-not $taskResponse.IsSuccessStatusCode) { throw 'Management request failed.' }
            return ($taskResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json)
        } finally { if ($taskResponse) { $taskResponse.Dispose() }; $taskRequest.Dispose() }
    }

    $taskStage = 'read_existing_settings'
    $taskExisting = Invoke-SettingsRequest 'POST' '/list'
    if ($null -eq $taskExisting.properties) { throw 'Existing settings are unavailable.' }
    $taskSettings = @{}
    foreach ($taskProperty in $taskExisting.properties.PSObject.Properties) { $taskSettings[$taskProperty.Name] = $taskProperty.Value }
    foreach ($taskName in @('PORT','WEBSITES_PORT','NODE_OPTIONS','NODE_TLS_REJECT_UNAUTHORIZED','NODE_EXTRA_CA_CERTS','SSLKEYLOGFILE','WEBSITE_RUN_FROM_PACKAGE','WEBSITE_WARMUP_STATUSES')) {
        if ($taskSettings.ContainsKey($taskName) -and $taskSettings[$taskName]) { throw 'Unexpected startup/TLS/package override. Stop for review.' }
    }
    $taskDesired = @{
        NODE_ENV = 'production'; HOST = '0.0.0.0'; PGSSLMODE = 'verify-full'
        PGHOST = 'pg-floorflow-demo-6e9587.postgres.database.azure.com'; PGPORT = '5432'; PGDATABASE = 'floorflow'
        PGUSER = 'floorflow_app'; PGPASSWORD = $taskPassword
        PREVIEW_USERNAME = $PreviewCredential.UserName; PREVIEW_PASSWORD = $taskPreviewPassword
        TRUST_PROXY = $TrustedProxy; PROXY_DIAGNOSTICS = $(if ($DiagnoseProxy) { 'on' } else { 'off' })
        AI_PGUSER = ''; AI_PGPASSWORD = ''; AZURE_FOUNDRY_ENDPOINT = ''; AZURE_FOUNDRY_MODEL = ''; AZURE_FOUNDRY_API_KEY = ''
        SCM_DO_BUILD_DURING_DEPLOYMENT = 'false'; ENABLE_ORYX_BUILD = 'false'
    }
    foreach ($taskName in @($taskSettings.Keys)) {
        if ($taskName -like 'PG*' -and -not $taskDesired.ContainsKey($taskName) -and $taskSettings[$taskName]) {
            throw 'Unexpected PostgreSQL startup override. Stop for review.'
        }
    }
    foreach ($taskName in $taskDesired.Keys) {
        # Canonical case matters to the Linux process environment.
        $taskSettings.Remove($taskName)
        $taskSettings[$taskName] = $taskDesired[$taskName]
    }
    $taskStage = 'apply_settings'
    $taskBody = @{ properties = $taskSettings } | ConvertTo-Json -Depth 6 -Compress
    $taskResult = Invoke-SettingsRequest 'PUT' '' $taskBody
    $taskStage = 'verify_settings'
    $taskResult = Invoke-SettingsRequest 'POST' '/list'
    foreach ($taskName in $taskDesired.Keys) {
        if ($taskResult.properties.$taskName -cne $taskDesired[$taskName]) { throw 'Settings readback mismatch.' }
    }
    Write-Output 'Existing App Service settings updated and read back. Credentials redacted; AI disabled. No database or publishing-policy changes.'
} catch {
    throw ('App settings stopped at ' + $taskStage + '. Outcome may be partial; inspect before retrying. No raw provider response is shown.')
} finally {
    if ($taskHttp) { $taskHttp.Dispose() }
    $taskToken = $null; $taskBody = $null; $taskSettings = $null; $taskDesired = $null; $taskExisting = $null; $taskResult = $null
    $taskPassword = $null; $taskPreviewPassword = $null; $taskCredential = $null
}
