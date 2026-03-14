$conn = Get-NetTCPConnection -LocalPort 4200 -ErrorAction SilentlyContinue
if ($conn) {
  Write-Host "Port 4200 still in use by PID(s): $($conn.OwningProcess -join ', ')"
} else {
  Write-Host "Port 4200 is free."
}
