@echo off
chcp 65001 > nul
cd /d "%~dp0"

:: Node.js で起動
where node >nul 2>&1
if %errorlevel% == 0 (
  echo Animation Studio を起動しています...
  start "" "http://localhost:8080"
  node server.js
  goto :end
)

:: Python 3 で起動
where python >nul 2>&1
if %errorlevel% == 0 (
  echo Animation Studio を起動しています...
  start "" "http://localhost:8080"
  python -m http.server 8080
  goto :end
)

:: どちらもない場合
echo Node.js が見つかりません。
echo https://nodejs.org からインストールしてください。
echo.
echo 今回は直接ファイルを開きます（録音機能は使えません）。
start "" "%~dp0index.html"

:end
