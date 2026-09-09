### Co to je?

Nástroj na dělení obálek převede PDF s rozloženou obálkou na samostatná vektorová PDF zadní a přední obálky. Výsledky spojí do jednoho archivu ZIP.

Formát A5, A4 nebo B5 zvolte, pokud mají vnější panely standardní výslednou šířku. Volba **Rozdělit na poloviny** rozdělí celou dvoustranu přesně v jejím středu. Výchozí volba se odhadne podle výšky první strany, pokud se přibližně do 3 mm shoduje se standardní ořezovou výškou, a pro každý soubor ji lze změnit samostatně.

Ve výchozím nastavení se zpracuje pouze 1. strana a 2. strana s vnitřní obálkou se ignoruje. Po zapnutí volby **Rozdělit také vnitřní obálku** vzniknou čtyři PDF stejného formátu: levá část 1. strany bude `_BACK`, pravá část 1. strany `_FRONT`, levá část 2. strany `_FRONT-inside` a pravá část 2. strany `_BACK-inside`.

### Jak to funguje?

Náhled první strany se vytvoří místně pomocí PDF.js. Po spuštění dělení běží Python a nástroje pro PDF místně v tomto prohlížeči prostřednictvím Pyodide a zachovají vektorový obsah zdrojového PDF. Žádné PDF se neodesílá. Při prvním použití se stáhne běhové prostředí Pythonu a balíček pro PDF, proto může první zpracování trvat déle než další běhy ve stejné relaci.

Každé zdrojové PDF může mít nejvýše 30 MB. Archiv ZIP vždy obsahuje soubory `_BACK.pdf` a `_FRONT.pdf` odvozené z původních názvů. Při zapnutém dělení vnitřní obálky obsahuje také `_FRONT-inside.pdf` a `_BACK-inside.pdf`.
