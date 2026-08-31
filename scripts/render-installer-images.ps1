param(
  [string]$LogoPath = "$PSScriptRoot\..\logo-small.png",
  [string]$OutDir = "$PSScriptRoot\..\src-tauri\icons"
)

Add-Type -AssemblyName System.Drawing

$logo = [System.Drawing.Image]::FromFile((Resolve-Path $LogoPath))

# NSIS header image: 150x57, light background, logo mark + wordmark.
$header = New-Object System.Drawing.Bitmap(150, 57)
$hg = [System.Drawing.Graphics]::FromImage($header)
$hg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$hg.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$hg.Clear([System.Drawing.Color]::White)
$hg.DrawImage($logo, 11, 14, 28, 28)
$nameFont = New-Object System.Drawing.Font('Segoe UI', 13, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$nameBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(19, 33, 43))
$hg.DrawString('OpenTheBook', $nameFont, $nameBrush, 45, 20)
$header.Save((Join-Path $OutDir 'installer-header.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp)
$hg.Dispose()
$header.Dispose()

# NSIS sidebar image: 164x314, brand gradient, centered logo + tagline.
$sidebar = New-Object System.Drawing.Bitmap(164, 314)
$sg = [System.Drawing.Graphics]::FromImage($sidebar)
$sg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$sg.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Rectangle(0, 0, 164, 314)),
  [System.Drawing.Color]::FromArgb(53, 167, 214),
  [System.Drawing.Color]::FromArgb(22, 125, 169),
  90
)
$sg.FillRectangle($gradient, 0, 0, 164, 314)
$sg.DrawImage($logo, 32, 62, 100, 100)
$sideName = New-Object System.Drawing.Font('Georgia', 22, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$center = New-Object System.Drawing.StringFormat
$center.Alignment = [System.Drawing.StringAlignment]::Center
$nameRect = New-Object System.Drawing.RectangleF(0, 178, 164, 30)
$sg.DrawString('OpenTheBook', $sideName, $whiteBrush, $nameRect, $center)
$tagFont = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$tagRect = New-Object System.Drawing.RectangleF(0, 214, 164, 20)
$sg.DrawString('Just open a book.', $tagFont, $whiteBrush, $tagRect, $center)
$sidebar.Save((Join-Path $OutDir 'installer-sidebar.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp)
$sg.Dispose()
$sidebar.Dispose()
$logo.Dispose()

Get-ChildItem $OutDir -Filter 'installer-*.bmp' | Select-Object Name, Length, LastWriteTime
