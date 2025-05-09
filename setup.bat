echo 'prepare Windows preinstall'
echo 'Installing Python dependencies for OCR...'
echo 'Installing uv'
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
echo 'Using uv to install markitdown'
uv sync
echo 'Finished install Python dependencies'
