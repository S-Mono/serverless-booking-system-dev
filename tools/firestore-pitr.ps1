param(
  [ValidateSet('list-window', 'list-points', 'clone-pitr', 'list-backups', 'restore-backup')]
  [string]$Action = 'list-points',

  [ValidateSet('develop', 'product')]
  [string]$Environment = 'develop',

  [string]$ProjectId,
  [string]$SourceDatabase = '(default)',
  [string]$DestinationDatabase,
  [string]$SnapshotTime,
  [int]$PointCount = 30,
  [int]$StepMinutes = 5,
  [string]$BackupName,
  [switch]$Execute
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectMap = @{
  develop = 'booking-system-dev-81786'
  product = 'booking-system-firebase-764d2'
}

if (-not $ProjectId) {
  $ProjectId = $projectMap[$Environment]
}

function Assert-Gcloud {
  if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    throw "gcloud CLI is not found. Install Google Cloud SDK and login first."
  }
}

function Invoke-GcloudJson {
  param([string[]]$Args)

  $raw = (& gcloud @Args 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0) {
    throw "gcloud failed: gcloud $($Args -join ' ')`n$raw"
  }

  if ([string]::IsNullOrWhiteSpace($raw)) {
    return $null
  }

  return ($raw | ConvertFrom-Json)
}

function Get-DatabaseInfo {
  return Invoke-GcloudJson @(
    'firestore', 'databases', 'describe',
    "--project=$ProjectId",
    "--database=$SourceDatabase",
    '--format=json'
  )
}

function Get-CurrentMinuteUtc {
  $utcNow = [DateTimeOffset]::UtcNow
  return [DateTimeOffset]::new(
    $utcNow.Year,
    $utcNow.Month,
    $utcNow.Day,
    $utcNow.Hour,
    $utcNow.Minute,
    0,
    [TimeSpan]::Zero
  )
}

function Get-PitrWindow {
  $db = Get-DatabaseInfo

  if (-not $db.earliestVersionTime) {
    throw "earliestVersionTime was not found in database metadata."
  }

  $earliest = [DateTimeOffset]::Parse($db.earliestVersionTime).ToUniversalTime()
  $latest = Get-CurrentMinuteUtc

  [pscustomobject]@{
    Earliest = $earliest
    Latest   = $latest
  }
}

function Get-RecoveryPoints {
  param(
    [int]$Count,
    [int]$Step
  )

  if ($Count -le 0) {
    throw "PointCount must be > 0."
  }

  if ($Step -le 0) {
    throw "StepMinutes must be > 0."
  }

  $window = Get-PitrWindow
  $points = New-Object System.Collections.Generic.List[object]

  for ($i = 0; $i -lt $Count; $i++) {
    $candidate = $window.Latest.AddMinutes(-1 * $i * $Step)
    if ($candidate -lt $window.Earliest) {
      break
    }

    $points.Add([pscustomobject]@{
      Index      = $points.Count
      Snapshot   = $candidate.ToString('yyyy-MM-ddTHH:mm:00Z')
      SnapshotJst = $candidate.ToOffset([TimeSpan]::FromHours(9)).ToString('yyyy-MM-dd HH:mm:ss zzz')
    })
  }

  return [pscustomobject]@{
    Window = $window
    Points = $points
  }
}

function Select-RecoveryPoint {
  param([object[]]$Points)

  if (-not $Points -or $Points.Count -eq 0) {
    throw "No selectable recovery points found in PITR window."
  }

  $Points | Format-Table -AutoSize | Out-Host
  $picked = Read-Host "Select Index"

  if (-not ($picked -match '^[0-9]+$')) {
    throw "Invalid index: $picked"
  }

  $idx = [int]$picked
  $chosen = $Points | Where-Object { $_.Index -eq $idx } | Select-Object -First 1
  if (-not $chosen) {
    throw "Index out of range: $idx"
  }

  return $chosen.Snapshot
}

function Show-CommandPreview {
  param([string[]]$Args)

  Write-Host ''
  Write-Host 'Dry-run mode (no API call executed).'
  Write-Host ('gcloud ' + ($Args -join ' '))
  Write-Host "Use -Execute to run this command."
}

function Invoke-ClonePitr {
  if (-not $DestinationDatabase) {
    throw "DestinationDatabase is required for clone-pitr."
  }

  $resolvedSnapshot = $SnapshotTime
  if (-not $resolvedSnapshot) {
    $result = Get-RecoveryPoints -Count $PointCount -Step $StepMinutes
    Write-Host ''
    Write-Host "Project: $ProjectId / Source DB: $SourceDatabase"
    Write-Host "PITR Window UTC: $($result.Window.Earliest.ToString('u')) -> $($result.Window.Latest.ToString('u'))"
    $resolvedSnapshot = Select-RecoveryPoint -Points $result.Points
  }

  $cmdA = @(
    'firestore', 'databases', 'clone', $DestinationDatabase,
    "--project=$ProjectId",
    "--source-database=$SourceDatabase",
    "--snapshot-time=$resolvedSnapshot"
  )

  $cmdB = @(
    'firestore', 'databases', 'clone',
    "--project=$ProjectId",
    "--source-database=$SourceDatabase",
    "--destination-database=$DestinationDatabase",
    "--snapshot-time=$resolvedSnapshot"
  )

  if (-not $Execute) {
    Show-CommandPreview -Args $cmdA
    return
  }

  Write-Host "Executing clone from PITR snapshot: $resolvedSnapshot"
  & gcloud @cmdA
  if ($LASTEXITCODE -ne 0) {
    Write-Warning 'First command shape failed. Retrying with alternate flag shape.'
    & gcloud @cmdB
    if ($LASTEXITCODE -ne 0) {
      throw "clone-pitr failed with both command variants."
    }
  }
}

function List-Backups {
  $cmdA = @(
    'firestore', 'backups', 'list',
    "--project=$ProjectId",
    "--database=$SourceDatabase",
    '--format=json'
  )

  $cmdB = @(
    'firestore', 'backups', 'list',
    "--project=$ProjectId",
    '--format=json'
  )

  try {
    $backups = Invoke-GcloudJson -Args $cmdA
  } catch {
    $backups = Invoke-GcloudJson -Args $cmdB
  }

  if (-not $backups) {
    Write-Host 'No backups found.'
    return
  }

  $rows = @($backups) | ForEach-Object {
    [pscustomobject]@{
      Name          = $_.name
      Database      = $_.database
      SnapshotTime  = $_.snapshotTime
      ExpireTime    = $_.expireTime
      State         = $_.state
    }
  }

  $rows | Format-Table -AutoSize
}

function Invoke-RestoreBackup {
  if (-not $DestinationDatabase) {
    throw "DestinationDatabase is required for restore-backup."
  }

  if (-not $BackupName) {
    throw "BackupName is required for restore-backup."
  }

  $cmdA = @(
    'firestore', 'databases', 'restore',
    "--project=$ProjectId",
    "--destination-database=$DestinationDatabase",
    "--source-backup=$BackupName"
  )

  $cmdB = @(
    'firestore', 'databases', 'restore', $DestinationDatabase,
    "--project=$ProjectId",
    "--source-backup=$BackupName"
  )

  if (-not $Execute) {
    Show-CommandPreview -Args $cmdA
    return
  }

  Write-Host "Executing restore from backup: $BackupName"
  & gcloud @cmdA
  if ($LASTEXITCODE -ne 0) {
    Write-Warning 'First command shape failed. Retrying with alternate shape.'
    & gcloud @cmdB
    if ($LASTEXITCODE -ne 0) {
      throw "restore-backup failed with both command variants."
    }
  }
}

Assert-Gcloud

switch ($Action) {
  'list-window' {
    $window = Get-PitrWindow
    Write-Host "Project: $ProjectId"
    Write-Host "Database: $SourceDatabase"
    Write-Host "EarliestVersionTime (UTC): $($window.Earliest.ToString('u'))"
    Write-Host "Now rounded to minute (UTC): $($window.Latest.ToString('u'))"
  }

  'list-points' {
    $result = Get-RecoveryPoints -Count $PointCount -Step $StepMinutes
    Write-Host "Project: $ProjectId / Source DB: $SourceDatabase"
    Write-Host "PITR Window UTC: $($result.Window.Earliest.ToString('u')) -> $($result.Window.Latest.ToString('u'))"
    $result.Points | Format-Table -AutoSize
  }

  'clone-pitr' {
    Invoke-ClonePitr
  }

  'list-backups' {
    List-Backups
  }

  'restore-backup' {
    Invoke-RestoreBackup
  }
}
