### Co to je?

Nahrajte PDF učebnice s živým textem a na každý řádek zadejte jedno rejstříkové heslo nebo slovní spojení. Získáte rejstřík nalezených tištěných stran ke kontrole, který lze zkopírovat nebo stáhnout jako tabulátorový soubor MD či TXT.

### Jak to funguje?

`PDF.js` přečte text PDF a v prohlížeči rozpozná čísla tištěných stran. Strany s nedostatkem textu se místně vykreslí a zkontrolují českým OCR `Tesseract.js`. Přes OpenRouter se nakonfigurovanému modelu odešle pouze seznam hesel, pro která navrhne gramatické tvary. Prohlížeč tvary ověří a vyhledá, seřadí odpovídající strany, použije vaše rozhodnutí z kontroly a sousední strany zapíše jako rozsahy.

Nálezy a možné strany jsou heuristické a vyžadují kontrolu. Číslování využívá rozpoznané kotvy; pokud není spolehlivé mapování dostupné, použije se záložní přiřazení 1:1 podle stran PDF. Runtime OCR a jazyková data se mohou stahovat, strany PDF však zůstávají místně.
