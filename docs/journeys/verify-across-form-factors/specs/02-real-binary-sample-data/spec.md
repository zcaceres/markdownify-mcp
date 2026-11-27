# Slice 02: Real Binary Sample Data Fixtures

Covers [VF-3](../../acceptance-criteria.md#2-provision--connect-each-selected-form-factor) from
[Verify Across Form Factors](../../plan.md). Cites **D4, D11, D16, D22, D42** from
[`REQUIREMENTS.md`](../../../../../REQUIREMENTS.md).

## Scope

Replace the 18-byte ASCII text placeholder files in `src/sample-data/` (`test.docx`, `test.xlsx`, `test.pptx`,
`test.jpg`) with real, minimal, valid binary files and add `test.wav` and `test.md` (`D42`):

1. **`src/sample-data/test.docx`:** Valid OOXML Word document containing `Test DOCX content`. Converts via `mammoth` on
   `markitdown[all]` and raises `MissingDependencyException` (+ `D22` hint) on slim Docker `markitdown[pdf]`.
2. **`src/sample-data/test.xlsx`:** Valid OOXML Excel workbook containing `Test XLSX content`. Converts via `openpyxl`
   on `markitdown[all]` and raises `MissingDependencyException` (+ `D22` hint) on slim Docker.
3. **`src/sample-data/test.pptx`:** Valid OOXML PowerPoint deck containing `Test PPTX content`. Converts via
   `python-pptx` on `markitdown[all]` and raises `MissingDependencyException` (+ `D22` hint) on slim Docker.
4. **`src/sample-data/test.jpg`:** Valid minimal binary JPEG image (`FF D8 FF ... FF D9`). Returns empty Markdown
   without LLM vision (`D4`, `D16`).
5. **`src/sample-data/test.wav`:** Valid minimal PCM WAV audio file (`RIFF...WAVE`).
6. **`src/sample-data/test.md`:** Valid Markdown file for `get-markdown-file` (`D26`, `D27`).
7. **`cli/docker.ts` & tests:** Simplify `cli/docker.ts` to test real `/data/test.docx` directly instead of staging a
   synthetic binary probe directory, and update `cli/docker.test.ts`, `src/Markdownify.test.ts`,
   `src/integrations/live.test.ts`, and `scenarios/live/convert-local-file.live.txt` as needed.

## Placeholders

None.
