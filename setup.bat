echo 'prepare Windows preinstall'
echo 'Installing Python dependencies for OCR...'
python -m venv .venv
.venv\Scripts\pip install "markitdown[all]>=0.1.5" "urllib3>=2.7.0" "idna>=3.15"
echo 'Finished installing Python dependencies'
