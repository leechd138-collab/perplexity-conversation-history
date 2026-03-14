@echo off
REM ============================================================
REM  NaughtyBits — Start Comet Browser with CDP (Remote Debugging)
REM  Required for NaughtyBits CDP injection to work.
REM  NOTE: Update the path below if Comet is installed elsewhere.
REM ============================================================
echo Starting Comet with --remote-debugging-port=9222 ...

REM Try common Comet install locations
if exist "%LOCALAPPDATA%\Comet\Application\comet.exe" (
    start "" "%LOCALAPPDATA%\Comet\Application\comet.exe" --remote-debugging-port=9222
    goto :done
)
if exist "%LOCALAPPDATA%\Comet\comet.exe" (
    start "" "%LOCALAPPDATA%\Comet\comet.exe" --remote-debugging-port=9222
    goto :done
)
if exist "C:\Program Files\Comet\Application\comet.exe" (
    start "" "C:\Program Files\Comet\Application\comet.exe" --remote-debugging-port=9222
    goto :done
)
if exist "%LOCALAPPDATA%\Programs\comet\comet.exe" (
    start "" "%LOCALAPPDATA%\Programs\comet\comet.exe" --remote-debugging-port=9222
    goto :done
)

echo ERROR: Could not find comet.exe. Edit this .bat file and set the correct path.
pause
exit /b 1

:done
echo Done. Comet is running with CDP enabled on port 9222.
pause
