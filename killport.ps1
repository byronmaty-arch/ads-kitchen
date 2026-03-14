$conn = Get-NetTCPConnection -LocalPort 4200 -ErrorAction SilentlyContinue
if ($conn) {
  $pids = $conn.OwningProcess | Select-Object -Unique
  foreach ($p in $pids) {
    $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
    if ($proc) {
      Write-Host "Killing PID $p ($($proc.Name)) on port 4200"
      Stop-Process -Id $p -Force
    }
  }
  Write-Host "Done."
} else {
  Write-Host "Port 4200 is already free."
}
