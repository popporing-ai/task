# Task DB backup schedule registration (daily 03:00)
# Run once as Administrator

$TaskName = "TaskDBBackup"
$ScriptPath = "D:\apps\task\scripts\backup.ps1"

# Remove existing task
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# Trigger: daily at 03:00
$Trigger = New-ScheduledTaskTrigger -Daily -At "03:00"

# Action: run backup script
$ArgString = '-ExecutionPolicy Bypass -File "' + $ScriptPath + '"'
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $ArgString

# Settings: run if missed, max 30 min
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

# Register
Register-ScheduledTask -TaskName $TaskName -Trigger $Trigger -Action $Action -Settings $Settings -Description "Task DB daily backup" -RunLevel Highest

Write-Host "[OK] Schedule registered: daily 03:00 auto backup"
Write-Host "    Backup location: D:\apps\task\backups\"
Write-Host "    Retention: 30 days"
Write-Host ""
Write-Host "Manual backup: powershell -File D:\apps\task\scripts\backup.ps1"
Write-Host "Check schedule: Get-ScheduledTask -TaskName TaskDBBackup"
