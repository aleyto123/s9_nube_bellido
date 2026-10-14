$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
try {
  $runningApp = Invoke-RestMethod -Uri 'http://localhost:3030/api/health' -TimeoutSec 1
  if ($runningApp.bucket -eq 'lab-09-bellido-20261014-4826') {
    Start-Process 'http://localhost:3030'
    exit
  }
} catch { }
Add-Type -AssemblyName System.Windows.Forms
$selector = New-Object System.Windows.Forms.OpenFileDialog
$selector.Title = 'Selecciona el CSV de claves descargado de IAM'
$selector.Filter = 'Claves IAM (*.csv)|*.csv'
$selector.InitialDirectory = Join-Path $env:USERPROFILE 'Downloads'
if ($selector.ShowDialog() -ne 'OK') { exit }
$rows = @(Import-Csv -LiteralPath $selector.FileName)
if ($rows.Count -eq 0) { throw 'El CSV esta vacio.' }
$keyColumn = @($rows[0].PSObject.Properties.Name | Where-Object { $_ -match '(?i)access.?key.?id' } | Select-Object -First 1)
$secretColumn = @($rows[0].PSObject.Properties.Name | Where-Object { $_ -match '(?i)secret.?access.?key' } | Select-Object -First 1)
if ($keyColumn.Count -eq 0 -or $secretColumn.Count -eq 0) { throw 'Selecciona el CSV de claves de acceso de IAM, no el CSV de inicio de sesion.' }
$env:AWS_ACCESS_KEY_ID = $rows[0].($keyColumn[0])
$env:AWS_SECRET_ACCESS_KEY = $rows[0].($secretColumn[0])
$env:AWS_REGION = 'us-east-1'
$env:S3_BUCKET = 'lab-09-bellido-20261014-4826'
$env:PORT = '3030'
if (!(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules'))) {
  & npm.cmd ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias.' }
}
Write-Host 'Iniciando la galeria. Mantén esta ventana abierta.'
$nodePath = (Get-Command node.exe).Source
$appProcess = Start-Process -FilePath $nodePath -ArgumentList 'server.js' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    if ($appProcess.HasExited) { throw 'La aplicacion no pudo iniciar. Comprueba que el puerto 3030 este libre.' }
    try {
      $health = Invoke-RestMethod -Uri 'http://localhost:3030/api/health' -TimeoutSec 1
      if ($health.bucket -eq $env:S3_BUCKET) { $ready = $true; break }
    } catch { Start-Sleep -Milliseconds 150 }
  }
  if (!$ready) { throw 'La aplicacion no respondio a tiempo.' }
  Start-Process 'http://localhost:3030'
  Write-Host 'Galeria abierta en http://localhost:3030. Para cerrar, pulsa Ctrl+C.'
  Wait-Process -Id $appProcess.Id
} finally {
  if (!$appProcess.HasExited) { Stop-Process -Id $appProcess.Id }
}
