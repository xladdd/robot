### What is this?

Describe what Adobe InDesign should find and what should replace it in plain language. You will get separate GREP strings for the Find What and Change To fields, ready to copy into InDesign.

### How does it work?

Robot resolves a small set of common, unambiguous operations with deterministic rules. Other instructions are sent through OpenRouter to `mistralai/ministral-8b-2512 🇪🇺`, which returns the two InDesign GREP strings; Robot then validates known unsafe patterns before displaying them. Only your written instructions are sent, never an InDesign document or its text.
