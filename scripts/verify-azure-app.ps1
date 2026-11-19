#Requires -Version 5.1
# Manual HTTP GET checks only. No Azure management, direct SQL or model requests.
[CmdletBinding()]
param(
    [ValidateSet('Proxy','Acceptance')][string]$Mode = 'Acceptance',
    [System.Management.Automation.PSCredential]$PreviewCredential
)
$ErrorActionPreference = 'Stop'
if ($Mode -eq 'Acceptance' -and $null -eq $PreviewCredential) { throw 'Supply the separate preview credential.' }
Add-Type -AssemblyName System.Net.Http
$taskHandler = New-Object Net.Http.HttpClientHandler
$taskHandler.AllowAutoRedirect = $false
$taskHttp = New-Object Net.Http.HttpClient $taskHandler
$taskHttp.Timeout = [TimeSpan]::FromSeconds(45)
$taskAuthorization = $null
$taskStage = 'proxy_checks'
$taskChecks = @()

function Read-Demo([string]$Path, [hashtable]$Headers = @{}, [bool]$Authenticated = $false, [bool]$PlainHttp = $false) {
    if ($PlainHttp -and $Authenticated) { throw 'Never send preview credentials over HTTP.' }
    $taskScheme = if ($PlainHttp) { 'http' } else { 'https' }
    $taskRequest = New-Object Net.Http.HttpRequestMessage ([Net.Http.HttpMethod]::Get), ($taskScheme + '://app-floorflow-demo-6e9587.azurewebsites.net' + $Path)
    foreach ($taskName in $Headers.Keys) { $taskRequest.Headers.Add($taskName, $Headers[$taskName]) }
    if ($Authenticated) { $taskRequest.Headers.Authorization = New-Object Net.Http.Headers.AuthenticationHeaderValue 'Basic', $taskAuthorization }
    $taskResponse = $null
    try {
        $taskResponse = $taskHttp.SendAsync($taskRequest).GetAwaiter().GetResult()
        return [PSCustomObject]@{ status = [int]$taskResponse.StatusCode
            body = $taskResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            contentType = [string]$taskResponse.Content.Headers.ContentType
            challenge = [string]$taskResponse.Headers.WwwAuthenticate
            cacheControl = [string]$taskResponse.Headers.CacheControl
            location = [string]$taskResponse.Headers.Location }
    } finally { if ($taskResponse) { $taskResponse.Dispose() }; $taskRequest.Dispose() }
}
function Assert-Demo([bool]$Condition) { if (-not $Condition) { throw 'Acceptance expectation failed.' } }

try {
    foreach ($taskProbe in @('baseline','spoof-http','spoof-list','spoof-forwarded')) {
        $taskHeaders = @{ 'X-FloorFlow-Proxy-Probe' = $taskProbe }
        if ($taskProbe -eq 'spoof-http') { $taskHeaders['X-Forwarded-Proto'] = 'http' }
        if ($taskProbe -eq 'spoof-list') { $taskHeaders['X-Forwarded-Proto'] = 'https,http' }
        if ($taskProbe -eq 'spoof-forwarded') { $taskHeaders['Forwarded'] = 'for=192.0.2.5;proto=http'; $taskHeaders['X-Forwarded-For'] = '192.0.2.5' }
        $taskResponse = Read-Demo '/health' $taskHeaders
        $taskChecks += @{ check = $taskProbe; status = $taskResponse.status }
        if ($Mode -eq 'Acceptance') { Assert-Demo ($taskResponse.status -eq 401 -and $taskResponse.challenge -like '*FloorFlow preview*') }
    }
    $taskResponse = Read-Demo '/health' @{ 'X-Forwarded-Proto' = 'https' } $false $true
    $taskChecks += @{ check = 'http-with-spoofed-https-no-credentials'; status = $taskResponse.status }
    Assert-Demo ($taskResponse.status -in @(301,302,307,308) -and $taskResponse.location -eq 'https://app-floorflow-demo-6e9587.azurewebsites.net/health')
    if ($Mode -eq 'Acceptance') {
        $taskAuthorization = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($PreviewCredential.UserName + ':' + $PreviewCredential.GetNetworkCredential().Password))
        $taskStage = 'protected_pages'
        foreach ($taskPath in @('/','/customer.html?id=1','/order.html?id=1','/health','/api/customers')) {
            $taskDenied = Read-Demo $taskPath
            Assert-Demo ($taskDenied.status -eq 401 -and $taskDenied.cacheControl -eq 'no-store')
        }
        foreach ($taskPath in @('/','/customer.html?id=1','/order.html?id=1')) {
            $taskPage = Read-Demo $taskPath @{} $true
            Assert-Demo ($taskPage.status -eq 200 -and $taskPage.contentType -like 'text/html*' -and $taskPage.body.Contains('FloorFlow'))
            $taskChecks += @{ check = $taskPath; status = $taskPage.status }
        }
        $taskStage = 'health_and_rest'
        $taskHealth = Read-Demo '/health' @{} $true
        $taskJson = $taskHealth.body | ConvertFrom-Json
        Assert-Demo ($taskHealth.status -eq 200 -and $taskJson.status -eq 'ok' -and $taskJson.database -eq 'connected')
        $taskCustomers = Read-Demo '/api/customers' @{} $true
        $taskJson = $taskCustomers.body | ConvertFrom-Json
        Assert-Demo ($taskCustomers.status -eq 200 -and @($taskJson).Count -eq 5)
        $taskCustomer = Read-Demo '/api/customers/1' @{} $true
        $taskJson = $taskCustomer.body | ConvertFrom-Json
        Assert-Demo ($taskCustomer.status -eq 200 -and $taskJson.id -eq 1 -and $taskJson.name -eq 'Maple Property Group')
        $taskOrders = Read-Demo '/api/customers/1/orders' @{} $true
        $taskJson = $taskOrders.body | ConvertFrom-Json
        Assert-Demo ($taskOrders.status -eq 200 -and @($taskJson).Count -eq 3)
        $taskOrder = Read-Demo '/api/orders/1' @{} $true
        $taskJson = $taskOrder.body | ConvertFrom-Json
        Assert-Demo ($taskOrder.status -eq 200 -and $taskJson.order_number -eq 'FF-2026-001' -and $taskJson.total -ceq '36117.00' -and $taskJson.customer.id -eq 1)
        $taskItems = Read-Demo '/api/orders/1/items' @{} $true
        $taskJson = $taskItems.body | ConvertFrom-Json
        Assert-Demo ($taskItems.status -eq 200 -and @($taskJson).Count -eq 4)
        $taskChecks += @{ check = 'health-and-five-read-only-REST-responses'; passed = $true }
    }
    @{ mode = $Mode; checks = $taskChecks; acceptancePassed = ($Mode -eq 'Acceptance'); modelRequests = 0 } | ConvertTo-Json -Depth 4
} catch {
    throw ('HTTP checks stopped at ' + $taskStage + '. No raw response or credential is shown. Review proxy/startup/DB state; do not weaken authentication.')
} finally { $taskAuthorization = $null; $taskHttp.Dispose() }
