@echo off
chcp 65001 > nul
cd /d "%~dp0"
where node > nul 2> nul
if errorlevel 1 (
  echo Node.js がインストールされていません。https://nodejs.org/ja から LTS 版をインストールしてください。
  pause
  exit /b 1
)
start "" cmd /c "timeout /t 2 > nul & start http://127.0.0.1:3800/"
node server.js
pause
