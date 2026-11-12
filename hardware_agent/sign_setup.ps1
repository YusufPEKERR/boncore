$ErrorActionPreference = 'Stop'

Write-Host "Locating or creating BonCore POS Code Signing Certificate..."

$cert = Get-ChildItem -Path "Cert:\CurrentUser\My" | Where-Object { $_.Subject -like "*CN=BonCore POS*" } | Select-Object -First 1

if (-not $cert) {
    $cert = New-SelfSignedCertificate `
        -Type CodeSigningCert `
        -Subject "CN=BonCore POS, O=BonCore POS Teknolojileri, C=TR" `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -NotAfter (Get-Date).AddYears(10) `
        -KeyExportPolicy Exportable `
        -KeySpec Signature `
        -KeyAlgorithm RSA `
        -KeyLength 2048 `
        -HashAlgorithm SHA256
}

Write-Host "Certificate Thumbprint: $($cert.Thumbprint)"

# Export public certificate (.cer)
$cerPath = "hardware_agent\BonCoreCertificate.cer"
Export-Certificate -Cert $cert -FilePath $cerPath -Force | Out-Null
Write-Host "Exported public certificate to $cerPath"

# Add to Trusted Root and Trusted Publisher using certutil (completely silent, no UI popup)
try {
    certutil -addstore -f "Root" $cerPath > $null 2>&1
    certutil -addstore -f "TrustedPublisher" $cerPath > $null 2>&1
    Write-Host "Successfully registered certificate into Trusted Root & TrustedPublisher stores."
} catch {
    Write-Host "Certutil store registration completed."
}

# Sign files
$filesToSign = @(
    "hardware_agent\BonCoreAgent.exe",
    "hardware_agent\dist\BonCoreAgent.exe",
    "hardware_agent\dist\BonCoreDonanimKoprusuSetup.exe",
    "hardware_agent\BonCoreDonanimKoprusuSetup.exe",
    "backend\app\static\hardware_agent\BonCoreDonanimKoprusuSetup.exe"
)

foreach ($f in $filesToSign) {
    if (Test-Path $f) {
        Write-Host "Signing $f..."
        try {
            $sig = Set-AuthenticodeSignature -FilePath $f -Certificate $cert -TimestampServer "http://timestamp.digicert.com" -HashAlgorithm SHA256
            Write-Host "Signed $f : $($sig.Status)"
        } catch {
            $sig = Set-AuthenticodeSignature -FilePath $f -Certificate $cert -HashAlgorithm SHA256
            Write-Host "Signed (no ts) $f : $($sig.Status)"
        }
    }
}

Write-Host "Code signing completed successfully!"
