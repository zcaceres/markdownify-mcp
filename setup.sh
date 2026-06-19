#!/bin/bash

echo 'prepare Unix preinstall'
echo 'Installing Python dependencies for OCR...'
python3 -m venv .venv
.venv/bin/pip install "markitdown[all]>=0.1.5" "urllib3>=2.7.0" "idna>=3.15"
echo 'Finished installing Python dependencies'
