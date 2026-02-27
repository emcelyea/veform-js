#!/bin/bash
set -e

echo "Building package..."
yarn build

echo "Publishing to npm..."
npm publish --access public

echo "Successfully published veform-js to npm!"
