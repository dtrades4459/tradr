# ═════════════════════════════════════════════════════════════════════
# TRADR · ROLLBACK to last known good
#
# Force-resets origin/main to commit 6b7df56 (the last build that was
# green and crash-free before the realtime/getMyCode work).
#
# Run on Windows (NOT in the Claude sandbox):
#   cd C:\Users\Dylon\OneDrive\Desktop\tradr
#   powershell -ExecutionPolicy Bypass -File .\ROLLBACK-TO-WORKING.ps1
#
# WARNING: this rewrites history. The polish + social commits will
# disappear from origin/main but stay in your local reflog (recoverable
# for ~30 days via `git reflog`). Do this only if you accept losing those
# pushed commits in the public history.
# ═════════════════════════════════════════════════════════════════════

# 0. (Manual) Pause OneDrive for 2h.

Set-Location C:\Users\Dylon\OneDrive\Desktop\tradr

Write-Host "Backing up your current working tree to ../tradr-backup-$(Get-Date -Format yyyyMMdd-HHmmss)..." -ForegroundColor Yellow
$backup = "..\tradr-backup-$(Get-Date -Format yyyyMMdd-HHmmss)"
Copy-Item -Recurse -Force . $backup
Write-Host "  saved to $backup" -ForegroundColor Green

Write-Host ""
Write-Host "Nuking corrupt git index (if any)..." -ForegroundColor Yellow
Remove-Item -Force .git\index -ErrorAction SilentlyContinue
Remove-Item -Force .git\index.lock -ErrorAction SilentlyContinue

Write-Host "Rebuilding index from current HEAD..." -ForegroundColor Yellow
git reset

Write-Host ""
Write-Host "Last 5 commits:" -ForegroundColor Cyan
git log --oneline -5

Write-Host ""
Write-Host "Hard-resetting working tree + index to 6b7df56..." -ForegroundColor Yellow
git reset --hard 6b7df56

Write-Host ""
Write-Host "After reset:" -ForegroundColor Cyan
git log --oneline -3

Write-Host ""
Write-Host "Force-pushing to origin/main..." -ForegroundColor Yellow
git push --force-with-lease origin main

Write-Host ""
Write-Host "Done. Vercel will redeploy in ~60-90s." -ForegroundColor Green
Write-Host ""
Write-Host "IMPORTANT next steps:" -ForegroundColor Cyan
Write-Host "  1. Wait for Vercel to show 'Ready' on the new deployment." -ForegroundColor White
Write-Host "  2. On every device, hard-reload to bust the PWA cache:" -ForegroundColor White
Write-Host "     - Desktop:  DevTools -> Application -> Clear site data, then Ctrl+Shift+R" -ForegroundColor Gray
Write-Host "     - iPhone:   delete the home-screen icon, Settings -> Safari -> Advanced ->" -ForegroundColor Gray
Write-Host "                 Website Data -> remove tradr, then re-add to home screen" -ForegroundColor Gray
Write-Host "     - Android:  app info -> Storage -> Clear storage, then reopen" -ForegroundColor Gray
Write-Host ""
Write-Host "If you ever want to recover the polish work, it's in the backup folder" -ForegroundColor Cyan
Write-Host "or via 'git reflog' (entries persist ~30 days)." -ForegroundColor Cyan
