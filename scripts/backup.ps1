param (
    [string]$DbUrl = ""
)

# PhD Nexus - Manual Database Backup Script
$project_ref = "rufjebyqbdpdgnofuzaq"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$filename = "backups/backup_$timestamp.sql"

if (!(Test-Path "backups")) { 
    New-Item -ItemType Directory -Path "backups" | Out-Null
    Write-Host "Created backups directory." -ForegroundColor Gray
}

Write-Host "-------------------------------------------" -ForegroundColor Cyan
Write-Host "Starting database backup for: $project_ref" -ForegroundColor Cyan
Write-Host "Target file: $filename" -ForegroundColor Gray
Write-Host "-------------------------------------------" -ForegroundColor Cyan

# Check for npx
if (!(Get-Command npx -ErrorAction SilentlyContinue)) {
    Write-Host "Error: npx not found. Please install Node.js." -ForegroundColor Red
    exit 1
}

# Check if project is linked (supabase folder exists)
if (!(Test-Path "supabase")) {
    Write-Host "-------------------------------------------" -ForegroundColor Yellow
    Write-Host "Project not linked yet." -ForegroundColor Yellow
    Write-Host "Please run the following command once to set up the connection:" -ForegroundColor Gray
    Write-Host "npx supabase link --project-ref $project_ref" -ForegroundColor Cyan
    Write-Host "-------------------------------------------" -ForegroundColor Yellow
    exit 1
}

# Run the dump using npx (defaults to --linked)
Write-Host "Running backup..." -ForegroundColor Gray

# Try to run the backup. If it fails due to Docker, we catch it.
$dumpError = ""
try {
    if ($DbUrl -ne "") {
        npx supabase db dump --db-url "$DbUrl" -f $filename 2>&1 | ForEach-Object { $dumpError += $_.ToString() + "`n" }
    } else {
        npx supabase db dump -f $filename 2>&1 | ForEach-Object { $dumpError += $_.ToString() + "`n" }
    }
} catch {
    $dumpError = $_.Exception.Message
}

if ($LASTEXITCODE -eq 0 -and $dumpError -notmatch "error during connect") {
    Write-Host "`nSUCCESS: Backup created at $filename" -ForegroundColor Green
} else {
    if ($dumpError -match "Docker Desktop is a prerequisite") {
        Write-Host "`nERROR: Docker is NOT running/installed." -ForegroundColor Red
        Write-Host "To do a backup WITHOUT Docker, you can run the following command directly:" -ForegroundColor Yellow
        Write-Host "`nnpx supabase db dump --db-url ""YOUR_CONNECTION_STRING"" -f $filename" -ForegroundColor Cyan
        Write-Host "`n(You can find your connection string in Supabase > Settings > Database)" -ForegroundColor Gray
    } else {
        Write-Host "`nFAILED: Database dump failed." -ForegroundColor Red
        Write-Host $dumpError -ForegroundColor Gray
    }
}
