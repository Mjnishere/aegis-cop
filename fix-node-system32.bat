@echo off
echo ===================================================
echo ResilienceRoute: Renaming 0-byte System32 phantom files...
echo ===================================================

if exist "C:\Windows\System32\node" (
    ren "C:\Windows\System32\node" node.bak
    echo [OK] Renamed C:\Windows\System32\node to node.bak
) else (
    echo [INFO] C:\Windows\System32\node does not exist or already renamed.
)

if exist "C:\Windows\System32\npm" (
    ren "C:\Windows\System32\npm" npm.bak
    echo [OK] Renamed C:\Windows\System32\npm to npm.bak
) else (
    echo [INFO] C:\Windows\System32\npm does not exist or already renamed.
)

if exist "C:\Windows\System32\npx" (
    ren "C:\Windows\System32\npx" npx.bak
    echo [OK] Renamed C:\Windows\System32\npx to npx.bak
) else (
    echo [INFO] C:\Windows\System32\npx does not exist or already renamed.
)

echo.
echo ===================================================
echo Verifying D:\ Node.js:
echo ===================================================
node -v
npm -v
echo.
echo All done! You can now run 'node -v' and 'npm run dev' anywhere.
pause
