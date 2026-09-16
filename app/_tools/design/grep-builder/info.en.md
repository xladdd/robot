### What is this?

GREP Builder turns a plain-language Find what / Change to instruction into code for Adobe InDesign’s GREP tab.

Describe what should be found in the first field and what should replace it in the second. Generated fields turn orange and can be copied individually.

Choose Try again to return to your original editable instructions. Always test the result on a copy or a small selection before changing an entire document.

### How does it work?

The protected server route first handles a small set of clear, common text operations deterministically for consistent English and Czech results. Other requests go to the fixed Ministral 3 8B 2512 model on OpenRouter. It returns separate InDesign Find What and Change To strings. Formatting-only requests are directed to InDesign Find Format. No InDesign document or document text is uploaded.
