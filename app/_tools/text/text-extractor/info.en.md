### What is this?

Upload, paste, or drop a short PDF, JPG, or PNG to turn its visible text into editable plain text. You can correct the result with an instruction, then copy it or download it as an MD or TXT file.

### How does it work?

Images and PDFs are uploaded through Robot to OpenRouter. PDFs use the `file-parser` plugin with `Mistral OCR` before model transcription. Temporary rate limits trigger one delayed retry of the same model. Mistral chat requests first prefer its EU provider and can retry on the regular Mistral provider; flags and model origin do not guarantee data residency.

Pasted plain text stays local until you request correction, which sends the editor text and instruction and replaces the editor with the returned revision.
