echo 'prepare Windows preinstall'
echo 'Installing Python dependencies for OCR...'
python -m venv .venv
.venv\Scripts\pip install "markitdown[all]>=0.1.5"
REM markitdown pins youtube-transcript-api~=1.0.0, and 1.0.x no longer parses YouTube's
REM current transcript responses (it raises ParseError, and markitdown then silently
REM emits the video page without a transcript). Upgrade it in a second step: installing
REM both constraints at once fails with ResolutionImpossible.
.venv\Scripts\pip install --upgrade "youtube-transcript-api>=1.2.4"
echo 'Finished installing Python dependencies'
