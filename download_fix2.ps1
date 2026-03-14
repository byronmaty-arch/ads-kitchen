$base = 'C:\Users\byron\Claud Projects\ads-kitchen\img'
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
$px = 'https://images.pexels.com/photos'
$q = '?auto=compress&cs=tinysrgb&w=700&h=470&dpr=1'

# Better mango/tropical juice image
$dl = @(
  @{id='11832019'; name='mango-juice.jpg'},
  @{id='8679419';  name='cocktail-juice.jpg'}
)

foreach ($d in $dl) {
  $url = "$px/$($d.id)/pexels-photo-$($d.id).jpeg$q"
  $out = "$base\$($d.name)"
  try {
    Invoke-WebRequest $url -OutFile $out -Headers @{'User-Agent'=$ua} -TimeoutSec 30
    $sz = (Get-Item $out).Length
    Write-Host "OK  $($d.name) - $sz bytes"
  } catch {
    Write-Host "ERR $($d.name) - $_"
  }
}
Write-Host "All files:"
Get-ChildItem "$base\*.jpg" | Select-Object Name, Length | Format-Table
