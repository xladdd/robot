### Co to je?

Přidejte jedno nebo více PDF s rozloženou obálkou, pro každý soubor zvolte A5, A4, B5 nebo rozdělení na stejné poloviny a případně zahrňte vnitřní obálku. Získáte samostatná vektorová PDF zadní a přední strany spojená v jednom archivu ZIP.

### Jak to funguje?

`PDF.js` zobrazí v prohlížeči náhled první strany každého souboru. Po spuštění dělení běží `Pyodide`, Python a `pypdf` v pomocném procesu prohlížeče a oříznou zdrojové strany bez rastrování jejich vektorů. Výstupy se pojmenují `_BACK.pdf` a `_FRONT.pdf`, při zvolené vnitřní obálce se doplní odpovídající vnitřní soubory, a vše se zabalí do ZIP; žádné PDF se neodesílá.
