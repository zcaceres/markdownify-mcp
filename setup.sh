#!/bin/bash

echo 'prepare Unix preinstall'
echo 'Installing Python dependencies for OCR...'
python3 -m venv .venv
.venv/bin/pip install "markitdown[all]>=0.1.5"
# markitdown pins youtube-transcript-api~=1.0.0, and 1.0.x no longer parses YouTube's
# current transcript responses (it raises ParseError, and markitdown then silently emits
# the video page without a transcript). Upgrade it in a second step: installing both
# constraints at once fails with ResolutionImpossible, and pip check reports no broken
# requirements afterwards.
.venv/bin/pip install --upgrade "youtube-transcript-api>=1.2.4"
echo 'Finished installing Python dependencies'
