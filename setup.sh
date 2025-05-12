#!/bin/bash

echo 'Installing Python dependencies for OCR...'
echo 'Installing uv'
curl -LsSf https://astral.sh/uv/install.sh | sh
echo 'uv installed, it will be used separately to install Python dependencies'
echo 'Finished installing uv'
