#!/bin/bash
set -euo pipefall
if [ ! -d external/scramjet ] || [ ! -d external/ultraviolet ]; then
  echo "Not all submodules found, installing..."
  git submodule update --init --recursive
else
  echo "All submodules exist, continuing..."
fi
projdir=$(pwd)
echo "Building Scramjet"
cd external/scramjet
pnpm i
pnpm rewriter:build
pnpm build
echo "Moving Scramjet files"
mv ./dist/scramjet.all.js "$projdir/public/scram/scramall.js"
mv ./dist/scramjet.sync.js "$projdir/public/scram/scramsync.js"
mv ./dist/scramjet.wasm.wasm "$projdir/public/scram/scram.wasm"
cd ../ultraviolet/
pnpm i
pnpm build
