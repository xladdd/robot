### What is this?

Index Creator finds requested words—and their grammatical forms—throughout a large textbook PDF.

Upload a live-text PDF, paste one index word or phrase per line, and create the index. Each line contains the original term, the strongest index pages, and all remaining matches in parentheses. Columns are separated by tabs.

Copy the finished index with the orange button, or download it directly as an MD or TXT file.

Check the automatically detected page-number mapping before using the result. You can correct the PDF-page and printed-page anchor underneath the output.

Always review the finished index. Languages are wonderfully untidy, and AI can miss or over-include an unusual form.

### How does it work?

PDF.js reads the live text locally, one page at a time, and looks for printed page numbers near the page edges. The PDF itself is not sent to an AI service. Only your short word list goes through OpenRouter to fixed Mistral Medium 3.5, which proposes Czech, English, Slovak or Romanian grammatical forms. The browser then searches those forms on every page and assembles the tab-separated index locally.
