param(
  [string]$LogoPath = "$PSScriptRoot\..\logo-small.png",
  [string]$OutPath = "$PSScriptRoot\..\public\og.png"
)

Add-Type -AssemblyName System.Drawing

$logo = [System.Drawing.Image]::FromFile((Resolve-Path $LogoPath))
$width = 1200
$height = 630
$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$background = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Rectangle(0, 0, $width, $height)),
  [System.Drawing.Color]::FromArgb(217, 241, 246),
  [System.Drawing.Color]::FromArgb(251, 250, 247),
  90
)
$graphics.FillRectangle($background, 0, 0, $width, $height)

$glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$glowPath.AddEllipse(410, 70, 380, 380)
$glow = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath)
$glow.CenterColor = [System.Drawing.Color]::FromArgb(170, 255, 255, 255)
$glow.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 232, 246, 250))
$graphics.FillPath($glow, $glowPath)

$logoSize = 300
$graphics.DrawImage($logo, (($width - $logoSize) / 2), 95, $logoSize, $logoSize)

$titleFont = New-Object System.Drawing.Font('Georgia', 54, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$titleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(19, 33, 43))
$center = New-Object System.Drawing.StringFormat
$center.Alignment = [System.Drawing.StringAlignment]::Center
$titleRect = New-Object System.Drawing.RectangleF(0, 415, $width, 70)
$graphics.DrawString('OpenTheBook', $titleFont, $titleBrush, $titleRect, $center)

$tagFont = New-Object System.Drawing.Font('Segoe UI', 22, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$tagBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(22, 125, 169))
$tagRect = New-Object System.Drawing.RectangleF(0, 500, $width, 40)
$graphics.DrawString('Just open a book.', $tagFont, $tagBrush, $tagRect, $center)

$bitmap.Save((Resolve-Path $OutPath), [System.Drawing.Imaging.ImageFormat]::Png)

$graphics.Dispose()
$bitmap.Dispose()
$logo.Dispose()
Get-Item $OutPath | Select-Object FullName, Length, LastWriteTime
