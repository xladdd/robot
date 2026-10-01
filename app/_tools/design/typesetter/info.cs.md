### Co to je?

Sazeč převádí nejednotně stylovaný rukopis ve Wordu na zkontrolovaný sémantický JSON pro připravenou šablonu InDesignu. Z IDML načte inventář stylů, pomocí AI klasifikuje bloky rukopisu a nabídne skript InDesignu, který naplní jeden hlavní zřetězený článek.

### Jak to funguje?

1. V InDesignu připravte a zřetězte hlavní textové rámečky. První rámeček označte v panelu Popisek skriptu jako `typesetter:story:main`, vytvořte potřebné odstavcové styly a šablonu exportujte jako IDML.
2. Nahrajte rukopis jako DOCX a šablonu jako IDML. Oba balíčky se otevřou místně v prohlížeči.
3. Nechte AI navrhnout malou řízenou sadu sémantických rolí. Potvrďte potřebné role a každou namapujte na styl nalezený v nahraném IDML.
4. Spusťte úplnou analýzu a zkontrolujte všechny nejisté nebo nepodporované bloky. Původní text a pořadí rukopisu zůstanou zachovány.
5. Stáhněte zkontrolovaný JSON a `import_typesetter.jsx`. Skript spusťte na kopii odpovídajícího souboru InDesignu a projděte všechny strany.

### Data a omezení

Soubory DOCX a IDML zůstávají v prohlížeči. Při předběžné a úplné analýze se nakonfigurovanému modelu OpenRouter odesílají extrahované bloky rukopisu; soubor IDML se neodesílá. V1 podporuje jeden hlavní článek, odstavcové styly, jednoduché seznamy, popisky a požadavky na obrázky. Nenavrhuje stránky, nesází složité tabulky ani neopravuje přetečený text.

Požadavky na obrázky vznikají jako běžné neukotvené rámečky ve vrstvě `IMAGE REQUESTS`. Umístěte nebo nahraďte je ručně. Importér vždy spouštějte na kopii a celý výsledek zkontrolujte.
