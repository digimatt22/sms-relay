#!/usr/bin/env bash
set -euo pipefail

npm run gateway:build
rm -rf .gateway-package public/gateway.tar.gz
mkdir -p .gateway-package/dist
cp -R packages/gateway/dist .gateway-package/
cp packages/gateway/package.json .gateway-package/
tar -czf public/gateway.tar.gz -C .gateway-package .
rm -rf .gateway-package
echo "Wrote public/gateway.tar.gz"
