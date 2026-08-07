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

echo "=== 4. Frontend v2 build (Asosiy production) ==="
cd ../meter-frontend-v2
# pnpm ko'pincha non-interactive ssh PATH'da bo'lmaydi — npm/npx ishonchli
npm install --silent 2>/dev/null
npx vite build 2>&1 | tail -5
if [ ! -f dist/index.html ]; then
    echo "XATO: frontend build muvaffaqiyatsiz (dist/index.html yo'q) — deploy to'xtatildi"
    exit 1
fi
rm -rf ../backend/frontend/*
cp -r dist/* ../backend/frontend/

if [ -d "/var/www/sss.boos.uz" ]; then
    rm -rf /var/www/sss.boos.uz/*
    cp -r dist/* /var/www/sss.boos.uz/
    chown -R www-data:www-data /var/www/sss.boos.uz
fi

echo "=== 5. Restart ==="
systemctl restart meter-api
sleep 3
systemctl status meter-api --no-pager | head -8

echo ""
echo "=== Tayyor! ==="
curl -s -o /dev/null -w "API: HTTP %{http_code}\n" http://127.0.0.1:8001/health
