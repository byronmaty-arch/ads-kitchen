# Find a free port starting from 7700
$usedPorts = (Get-NetTCPConnection -ErrorAction SilentlyContinue).LocalPort
for ($p = 7700; $p -le 7800; $p++) {
  if ($usedPorts -notcontains $p) {
    Write-Host "FREE_PORT:$p"
    break
  }
}
