echo 'prepare Windows preinstall'
echo 'Installing Python dependencies for OCR...'
python -m venv .venv
.venv\Scripts\pip install "markitdown>=0.1.5"
echo 'Finished installing Python dependencies'
