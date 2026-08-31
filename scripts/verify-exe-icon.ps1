param(
  [string]$ExePath = "$PSScriptRoot\..\src-tauri\target\release\openthebook.exe"
)

Add-Type -AssemblyName System.Drawing

$icon = [System.Drawing.Icon]::ExtractAssociatedIcon((Resolve-Path $ExePath))
$bitmap = $icon.ToBitmap()
$expected = [System.Drawing.Bitmap]::FromFile((Resolve-Path "$PSScriptRoot\..\src-tauri\icons\32x32.png"))

$match = ($bitmap.Width -eq $expected.Width) -and ($bitmap.Height -eq $expected.Height)
if ($match) {
  for ($y = 0; $y -lt $bitmap.Height; $y += 1) {
    for ($x = 0; $x -lt $bitmap.Width; $x += 1) {
      $actualPixel = $bitmap.GetPixel($x, $y)
      $expectedPixel = $expected.GetPixel($x, $y)
      if ($actualPixel.R -ne $expectedPixel.R -or $actualPixel.G -ne $expectedPixel.G -or
          $actualPixel.B -ne $expectedPixel.B -or $actualPixel.A -ne $expectedPixel.A) {
        $match = $false
        break
      }
    }
    if (-not $match) { break }
  }
}

Write-Output ("embedded exe icon matches src-tauri/icons/32x32.png: $match")
$bitmap.Dispose()
$expected.Dispose()
$icon.Dispose()
