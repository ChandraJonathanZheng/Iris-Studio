# Run this in PowerShell. The password prompt is masked, and its value is passed to dotnet over stdin.
$ErrorActionPreference = 'Stop'
$project = Join-Path $PSScriptRoot '..\server\IrisStudio.Api'
$securePassword = Read-Host 'Google App Password for lead938@gmail.com (16 characters)' -AsSecureString
try {
    $password = ([System.Net.NetworkCredential]::new('', $securePassword)).Password -replace '\s', ''
    if ($password.Length -ne 16) {
        throw 'Use the 16-character Google App Password from https://myaccount.google.com/apppasswords.'
    }
    $settings = @{
        'Notifications:EmailProvider' = 'Smtp'
        'Notifications:FromEmail' = 'lead938@gmail.com'
        'Notifications:Smtp:Host' = 'smtp.gmail.com'
        'Notifications:Smtp:Port' = '587'
        'Notifications:Smtp:Username' = 'lead938@gmail.com'
        'Notifications:Smtp:Password' = $password
    }
    $settings | ConvertTo-Json -Compress | & dotnet user-secrets set --project $project
    if ($LASTEXITCODE -ne 0) { throw 'Could not save Gmail settings to .NET user-secrets.' }
    Write-Host 'Gmail SMTP settings saved. Restart the API to load them.'
    Write-Host 'External notifications follow Notifications:Enabled; this script does not change that setting.'
}
finally {
    $password = $null
    $settings = $null
    $securePassword.Dispose()
}
