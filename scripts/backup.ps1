# Task DB backup script

$BackupDir = "D:\apps\task\backups"
$Date = Get-Date -Format "yyyyMMdd_HHmmss"
$SubDir = "$BackupDir\task_backup_$Date"
$ScriptDir = "D:\apps\task\scripts"

if (!(Test-Path $SubDir)) {
    New-Item -ItemType Directory -Path $SubDir | Out-Null
}

# 1. SQL full backup
docker exec task-db-1 pg_dump -U task -d task --clean --if-exists > "$SubDir\full_backup.sql"
Write-Host "[OK] full_backup.sql"

# 2. Copy SQL export script into container and run
docker cp "$ScriptDir\export-csv.sql" task-db-1:/tmp/export-csv.sql
docker exec task-db-1 psql -U task -d task -f /tmp/export-csv.sql

# 3. Copy CSV files out of container
$CsvFiles = @("users","tasks","content_items","timeline_items","rrr_items","task_categories","audit_logs")
foreach ($f in $CsvFiles) {
    docker cp "task-db-1:/tmp/$f.csv" "$SubDir\$f.csv" 2>$null
    if (Test-Path "$SubDir\$f.csv") {
        Write-Host "[OK] $f.csv"
    } else {
        Write-Host "[SKIP] $f.csv (no data)"
    }
}

# 4. Cleanup container temp files
docker exec task-db-1 sh -c "rm -f /tmp/*.csv /tmp/export-csv.sql"

# 5. Compress
try {
    Compress-Archive -Path $SubDir -DestinationPath "$SubDir.zip" -Force
    Remove-Item -Recurse -Force $SubDir
    Write-Host "[OK] Compressed: task_backup_$Date.zip"
} catch {
    Write-Host "[WARN] Compression skipped"
}

# 6. Delete backups older than 30 days
Get-ChildItem "$BackupDir\*" -Include *.zip | Where-Object {
    $_.LastWriteTime -lt (Get-Date).AddDays(-30)
} | ForEach-Object {
    Remove-Item $_.FullName
    Write-Host "[DEL] $($_.Name)"
}

Write-Host "[DONE] Backup complete: task_backup_$Date"
