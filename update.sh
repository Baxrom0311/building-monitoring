#!/bin/bash
# Meter Monitor — git pull + build + restart
# Ishlatish: bash /root/meter_repo/update.sh
set -e
cd /root/meter_repo

echo "=== 1. Git pull ==="
git pull origin main

echo "=== 2. Python deps ==="
cd backend
venv/bin/pip install -q -r requirements.txt 2>&1 | tail -3

echo "=== 3. DB migration ==="
set -a
source .env
set +a
venv/bin/alembic upgrade head

echo "=== 4. Frontend build ==="
cd ../meter-frontend
npm install --legacy-peer-deps --silent 2>/dev/null
npx vite build 2>&1 | tail -3
rm -rf ../backend/frontend/*
cp -r dist/* ../backend/frontend/

echo "=== 5. Restart ==="
systemctl restart meter-api
sleep 3
systemctl status meter-api --no-pager | head -8

echo ""
echo "=== Tayyor! ==="
curl -s -o /dev/null -w "API: HTTP %{http_code}\n" http://127.0.0.1:8001/health
