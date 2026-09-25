### What is this?

Upload, paste, or drop a short PDF, JPG, or PNG to turn its visible text into editable plain text. You can correct the result with an instruction, then copy it or download it as an MD or TXT file.

### How does it work?

The file is sent through OpenRouter. Images are read by `mistralai/mistral-small-2603 🇪🇺`; if its provider is temporarily rate-limited, Robot briefly waits and retries the same model once. PDFs are first read with `Mistral OCR 🇪🇺` and then transcribed by `mistralai/mistral-small-2603`. The returned text is displayed in the editor. If you request a correction, the text and your instruction are sent to `mistralai/ministral-8b-2512 🇪🇺`, and the returned revision replaces the editor content.
