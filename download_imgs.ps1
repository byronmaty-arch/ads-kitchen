$base = 'C:\Users\byron\Claud Projects\ads-kitchen\img'
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
$px = 'https://images.pexels.com/photos'
$q = '?auto=compress&cs=tinysrgb&w=700&h=470&dpr=1'

$dl = @(
  @{id='12118979'; name='chips-chicken.jpg'},
  @{id='1510714';  name='chips-fish.jpg'},
  @{id='769289';   name='chips-beef.jpg'},
  @{id='1639558';  name='chips-goat.jpg'},
  @{id='2901854';  name='chips-liver.jpg'},
  @{id='2901854';  name='sausages.jpg'},
  @{id='170849';   name='omelette.jpg'},
  @{id='1117862';  name='chapati.jpg'},
  @{id='1618952';  name='katogo.jpg'},
  @{id='96620';    name='juice.jpg'},
  @{id='8375041';  name='cocktail-juice.jpg'},
  @{id='11009208'; name='mango-juice.jpg'}
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
Write-Host "Done."
