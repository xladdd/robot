### Co to je?

Nahrajte rukopis v PDF o rozsahu nejvýše 20 stran a vyhledejte v něm smysluplné obrazové prvky. Získáte prompty pro ilustrace v pořadí zdrojových stran, které lze zkopírovat nebo stáhnout jako soubor MD či TXT.

### Jak to funguje?

`PDF.js` zkontroluje počet stran a každou stranu v prohlížeči vykreslí jako přehledový obrázek a zvětšené detaily. Tyto obrázky stran se po jedné odešlou přes OpenRouter modelu `qwen/qwen3.5-122b-a10b 🇨🇳`, který obrazové prvky zaeviduje a ověří. Prohlížeč vrácené prompty seskupí podle zdrojových stran a zobrazí výsledek; textová vrstva ani původní soubor PDF se neodesílají.
