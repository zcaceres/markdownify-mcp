#!/bin/bash

echo 'prepare Unix preinstall'
echo 'Installing Python dependencies for OCR...'
python3 -m venv .venv
.venv/bin/pip install "markitdown>=0.1.5"
echo 'Finished installing Python dependencies'
