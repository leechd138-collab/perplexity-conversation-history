@echo off
REM ============================================================
REM  NaughtyBits — Start Edge with CDP (Remote Debugging)
REM  Required for NaughtyBits CDP injection to work.
REM ============================================================
echo Starting Edge with --remote-debugging-port=9222 ...
start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222
echo Done. Edge is running with CDP enabled on port 9222.
pause
