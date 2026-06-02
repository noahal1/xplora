@echo off
cd /d "%~dp0backend"

:: Check Python is available
where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python not found. Please install Python and make sure it's in your PATH.
    pause
    exit /b 1
)

:: Check uvicorn is installed
python -c "import uvicorn" 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] uvicorn not found. Run: pip install -r requirements.txt
    pause
    exit /b 1
)

cls
echo ========================================
echo   Xplore Movie Recommender - Backend
echo ========================================
echo.
echo   Server: http://localhost:8327
echo   Docs:   http://localhost:8327/docs
echo.
echo   Press Ctrl+C to stop
echo ========================================
echo.

python -m uvicorn main:app --host 0.0.0.0 --port 8327

echo.
echo [ERROR] Server stopped unexpectedly.
pause
