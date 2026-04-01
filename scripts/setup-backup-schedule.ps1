# Task DB 백업 스케줄 등록 (매일 새벽 3시)
# 관리자 권한으로 1회 실행

$TaskName = "TaskDBBackup"
$ScriptPath = "D:\apps\task\scripts\backup.ps1"

# 기존 작업 삭제
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# 트리거: 매일 새벽 3시
$Trigger = New-ScheduledTaskTrigger -Daily -At "03:00"

# 액션: PowerShell로 백업 스크립트 실행
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File `"$ScriptPath`""

# 설정: 놓친 실행 즉시 실행, 최대 30분
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

# 등록
Register-ScheduledTask -TaskName $TaskName -Trigger $Trigger -Action $Action -Settings $Settings -Description "Task 마케팅 DB 매일 백업" -RunLevel Highest

Write-Host "[OK] 스케줄 등록 완료: 매일 03:00 자동 백업"
Write-Host "    백업 위치: D:\apps\task\backups\"
Write-Host "    보관 기간: 30일"
Write-Host ""
Write-Host "수동 백업: powershell -File D:\apps\task\scripts\backup.ps1"
Write-Host "스케줄 확인: Get-ScheduledTask -TaskName TaskDBBackup"
