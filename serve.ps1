$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
if (-not $root) { $root = Split-Path -Parent $MyInvocation.MyCommand.Definition }
$port = if ($env:PORT) { [int]$env:PORT } else { 7700 }

Write-Host "Starting server on port $port, root=$root"
[Console]::Out.Flush()

$mimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css"
  ".js"   = "application/javascript"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
  ".woff2"= "font/woff2"
}

try {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
  $listener.Start()
  Write-Host "Server running at http://localhost:$port/"
  Write-Host "Local: http://localhost:$port/"
  Write-Host "Listening on http://localhost:$port/"
  [Console]::Out.Flush()
} catch {
  Write-Host "ERROR starting listener: $_"
  [Console]::Out.Flush()
  exit 1
}

while ($true) {
  try {
    $client = $listener.AcceptTcpClient()
  } catch { break }

  $stream = $client.GetStream()
  $reader = [System.IO.StreamReader]::new($stream)
  $writer = [System.IO.BinaryWriter]::new($stream)

  try {
    $requestLine = $reader.ReadLine()
    if (-not $requestLine) { $client.Close(); continue }
    while (($line = $reader.ReadLine()) -and $line -ne "") {}

    $parts = $requestLine -split " "
    $path  = if ($parts.Count -gt 1) { $parts[1] } else { "/" }
    if ($path -eq "/" -or $path -eq "") { $path = "/index.html" }
    $path  = ($path -replace "\?.*", "").TrimStart("/").Replace("/", "\")
    $filePath = Join-Path $root $path

    if (Test-Path $filePath -PathType Leaf) {
      $ext   = [System.IO.Path]::GetExtension($filePath).ToLower()
      $mime  = if ($mimeTypes[$ext]) { $mimeTypes[$ext] } else { "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($filePath)
      $hdr   = [System.Text.Encoding]::ASCII.GetBytes("HTTP/1.1 200 OK`r`nContent-Type: $mime`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n")
      $writer.Write($hdr); $writer.Write($bytes)
    } else {
      $body  = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
      $hdr   = [System.Text.Encoding]::ASCII.GetBytes("HTTP/1.1 404 Not Found`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n")
      $writer.Write($hdr); $writer.Write($body)
    }
    $writer.Flush()
  } catch {}
  $client.Close()
}
