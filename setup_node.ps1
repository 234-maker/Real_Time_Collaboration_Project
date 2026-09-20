# setup_node.ps1
# This script downloads a portable Node.js zip archive, extracts it to the .bin directory,
# and verifies that node and npm work.

$ErrorActionPreference = "Stop"

# Define paths
$binDir = Join-Path $PSScriptRoot ".bin"
$nodeZip = Join-Path $binDir "node.zip"
$nodeUrl = "https://nodejs.org/dist/v20.15.0/node-v20.15.0-win-x64.zip"

Write-Output "Creating .bin directory..."
if (-not (Test-Path $binDir)) {
    New-Item -ItemType Directory -Path $binDir | Out-Null
}

Write-Output "Downloading portable Node.js v20.15.0 from $nodeUrl..."
# Use Net.WebClient or Invoke-WebRequest
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeZip

Write-Output "Extracting archive..."
Expand-Archive -Path $nodeZip -DestinationPath $binDir -Force

Write-Output "Cleaning up ZIP archive..."
Remove-Item -Path $nodeZip

# Find the extracted folder name
$extractedFolder = Get-ChildItem -Path $binDir -Directory | Where-Object { $_.Name -like "node-*" } | Select-Object -First 1

if ($null -eq $extractedFolder) {
    Write-Error "Failed to locate extracted Node.js folder in .bin."
    exit 1
}

# Move contents to the root of .bin or create symbolic link/scripts
# To make it clean, we will move all files from the extracted folder directly into .bin
Write-Output "Reorganizing files..."
$nodePath = $extractedFolder.FullName
Get-ChildItem -Path $nodePath | ForEach-Object {
    $dest = Join-Path $binDir $_.Name
    if (Test-Path $dest) {
        Remove-Item -Path $dest -Recurse -Force
    }
    Move-Item -Path $_.FullName -Destination $binDir -Force
}

# Remove the now empty extracted directory
Remove-Item -Path $nodePath -Recurse -Force

Write-Output "Node.js setup successfully!"
Write-Output "Verifying installation:"
$nodeExe = Join-Path $binDir "node.exe"
$npmCmd = Join-Path $binDir "npm.cmd"

if (Test-Path $nodeExe) {
    & $nodeExe -v
    & $npmCmd -v
} else {
    Write-Error "Verification failed: node.exe not found."
}
