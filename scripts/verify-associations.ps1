param(
    [Parameter(Mandatory = $true)]
    [string] $InstallDir,

    [string[]] $Extensions = @('pdf', 'epub', 'azw3', 'mobi')
)

$ErrorActionPreference = 'Stop'
$exePath = [IO.Path]::GetFullPath((Join-Path $InstallDir 'openthebook.exe'))
$expectedCommand = '"{0}" "%1"' -f $exePath
$applicationKey = 'Registry::HKEY_CURRENT_USER\Software\Classes\Applications\openthebook.exe'
$failures = [Collections.Generic.List[string]]::new()

function Get-RegistryValueOrNull {
    param([string] $Path, [string] $Name = '')

    try {
        $key = Get-Item -LiteralPath $Path -ErrorAction Stop
        if ([string]::IsNullOrEmpty($Name)) {
            $key.GetValue('', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
        } else {
            $key.GetValue($Name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
        }
    } catch [System.Management.Automation.ItemNotFoundException] {
        $null
    } catch [System.Management.Automation.PSArgumentException] {
        $null
    }
}

foreach ($extension in $Extensions) {
    $normalizedExtension = $extension.TrimStart('.').ToLowerInvariant()
    $class = "OpenTheBook.{0}" -f $normalizedExtension.ToUpperInvariant()
    $extensionKey = "Registry::HKEY_CURRENT_USER\Software\Classes\.{0}" -f $normalizedExtension
    $classKey = "Registry::HKEY_CURRENT_USER\Software\Classes\{0}" -f $class

    $defaultClass = Get-RegistryValueOrNull -Path $extensionKey
    if ($defaultClass -ne $class) {
        $failures.Add(".$normalizedExtension default is '$defaultClass'; expected '$class'.")
    }

    $openCommand = Get-RegistryValueOrNull -Path "$classKey\shell\open\command"
    if ($openCommand -ne $expectedCommand) {
        $failures.Add("$class open command is '$openCommand'; expected '$expectedCommand'.")
    }

    $icon = Get-RegistryValueOrNull -Path "$classKey\DefaultIcon"
    $expectedIcon = '"{0}",0' -f $exePath
    if ($icon -ne $expectedIcon) {
        $failures.Add("$class icon is '$icon'; expected '$expectedIcon'.")
    }

    $openWith = Get-RegistryValueOrNull -Path "$extensionKey\OpenWithProgids" -Name $class
    if ($null -eq $openWith) {
        $failures.Add(".$normalizedExtension is missing OpenTheBook in OpenWithProgids.")
    }

    $fileExtsOpenWith = Get-RegistryValueOrNull -Path "Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.$normalizedExtension\OpenWithProgids" -Name $class
    if ($null -eq $fileExtsOpenWith) {
        $failures.Add(".$normalizedExtension is missing OpenTheBook in FileExts OpenWithProgids.")
    }

    $fileExtsApplication = Get-RegistryValueOrNull -Path "Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.$normalizedExtension\OpenWithList" -Name 'a'
    if ($fileExtsApplication -ne 'openthebook.exe') {
        $failures.Add(".$normalizedExtension FileExts OpenWithList entry 'a' is '$fileExtsApplication'; expected 'openthebook.exe'.")
    }

    $supportedType = Get-RegistryValueOrNull -Path "$applicationKey\SupportedTypes" -Name ".$normalizedExtension"
    if ($null -eq $supportedType) {
        $failures.Add("Applications\\openthebook.exe is missing SupportedTypes for .$normalizedExtension.")
    }
}

$friendlyName = Get-RegistryValueOrNull -Path $applicationKey -Name 'FriendlyAppName'
if ($friendlyName -ne 'OpenTheBook') {
    $failures.Add("Applications\\openthebook.exe FriendlyAppName is '$friendlyName'; expected 'OpenTheBook'.")
}

$capabilityPath = 'Registry::HKEY_CURRENT_USER\Software\OpenTheBook\Capabilities\FileAssociations'
foreach ($extension in $Extensions) {
    $normalizedExtension = $extension.TrimStart('.').ToLowerInvariant()
    $class = "OpenTheBook.{0}" -f $normalizedExtension.ToUpperInvariant()
    $capability = Get-RegistryValueOrNull -Path $capabilityPath -Name ".$normalizedExtension"
    if ($capability -ne $class) {
        $failures.Add("Registered capability for .$normalizedExtension is '$capability'; expected '$class'.")
    }
}

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Output ("Association verification passed for {0}: {1}" -f $exePath, ($Extensions -join ', '))
