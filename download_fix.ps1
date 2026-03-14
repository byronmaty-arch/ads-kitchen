$base = 'C:\Users\byron\Claud Projects\ads-kitchen\img'
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
$px = 'https://images.pexels.com/photos'
$q = '?auto=compress&cs=tinysrgb&w=700&h=470&dpr=1'

$dl = @(
  @{id='3997609'; name='chips-liver.jpg'},   # grilled meat on charcoal (better for liver)
  @{id='3584';    name='mango-juice.jpg'},    # orange juice (larger, better quality)
  @{id='1583891'; name='chips.jpg'}           # french fries (already exists, just re-confirm)
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
