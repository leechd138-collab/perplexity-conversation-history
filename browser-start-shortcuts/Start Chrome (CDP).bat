@echo off
REM ============================================================
REM  NaughtyBits — Start Chrome with CDP (Remote Debugging)
REM  Required for NaughtyBits CDP injection to work.
REM ============================================================
echo Starting Chrome with --remote-debugging-port=9222 ...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
echo Done. Chrome is running with CDP enabled on port 9222.
pause
