# Task DB 백업 스크립트
# 매일 자동 실행 또는 수동 실행 가능

$BackupDir = "D:\apps\task\backups"
$Date = Get-Date -Format "yyyyMMdd_HHmmss"
$FileName = "task_backup_$Date.sql"

# 백업 폴더 생성
if (!(Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

# pg_dump 실행
docker exec task-db-1 pg_dump -U task -d task --clean --if-exists > "$BackupDir\$FileName"

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] 백업 완료: $BackupDir\$FileName"

    # gzip 압축 (PowerShell 7+)
    try {
        Compress-Archive -Path "$BackupDir\$FileName" -DestinationPath "$BackupDir\$FileName.zip" -Force
        Remove-Item "$BackupDir\$FileName"
        Write-Host "[OK] 압축 완료: $FileName.zip"
    } catch {
        Write-Host "[WARN] 압축 생략 (원본 유지)"
    }

    # 30일 이상 된 백업 삭제
    Get-ChildItem "$BackupDir\*" -Include *.sql,*.zip | Where-Object {
        $_.LastWriteTime -lt (Get-Date).AddDays(-30)
    } | ForEach-Object {
        Remove-Item $_.FullName
        Write-Host "[삭제] 오래된 백업: $($_.Name)"
    }
} else {
    Write-Host "[ERROR] 백업 실패!"
    exit 1
}
