@echo off
chcp 65001 > nul
echo Animation Studio を起動しています...

:: Node.js が使える場合
where node >nul 2>&1
if %errorlevel% == 0 (
  echo http://localhost:8080 をブラウザで開いてください
  start "" "http://localhost:8080"
  npx --yes serve -p 8080 -s .
  goto :end
)

:: Python 3 が使える場合
where python >nul 2>&1
if %errorlevel% == 0 (
  echo http://localhost:8080 をブラウザで開いてください
  start "" "http://localhost:8080"
  python -m http.server 8080
  goto :end
)

:: どちらもない場合は直接ファイルを開く（録音機能は使えません）
echo Node.js / Python が見つかりません。ブラウザで直接開きます。
echo 注意: 録音機能は localhost 経由でのみ使えます。
start "" "%~dp0index.html"

:end
