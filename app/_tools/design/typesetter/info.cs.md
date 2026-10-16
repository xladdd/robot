### Co to je?

Sazeč převádí nejednotně stylovaný rukopis ve Wordu na zkontrolovaný sémantický JSON pro připravenou šablonu InDesignu. Z IDML načte inventář stylů, pomocí AI klasifikuje bloky rukopisu a nabídne skript InDesignu, který naplní jeden hlavní zřetězený článek.

### Jak to funguje?

V InDesignu připravte a zřetězte hlavní textové rámečky. První rámeček označte v panelu Popisek skriptu jako `typesetter:story:main`, vytvořte potřebné odstavcové styly a šablonu exportujte jako IDML. Načtěte rukopis jako DOCX a šablonu jako IDML; oba balíčky se otevřou místně v prohlížeči. Extrakce zachovává prostý text a původní pořadí, nikoli formátování Wordu. Pro místní extrakci se může stahovat běhové prostředí `Python` pro prohlížeč.

Při předběžné a úplné analýze se přes OpenRouter nakonfigurovanému modelu odesílají extrahované bloky rukopisu; soubory DOCX a IDML zůstávají v prohlížeči a soubor IDML se neodesílá. Z navržené řízené sady potvrďte potřebné sémantické role a každou namapujte na odstavcový styl nalezený v IDML. Spusťte úplnou analýzu, zkontrolujte nejisté nebo nepodporované bloky a stáhněte zkontrolovaný JSON `indesign-typesetter-v1` a `import_typesetter.jsx`.

Importér nahradí označený hlavní článek a přeskočí nepodporované bloky. Podporuje odstavcové styly, jednoduché seznamy, popisky a požadavky na obrázky, ale nenavrhuje stránky, nesází složité tabulky ani neopravuje přetečený text. Požadavky na obrázky vznikají jako běžné neukotvené rámečky ve vrstvě `IMAGE REQUESTS` k ručnímu umístění nebo nahrazení. Skript spusťte na kopii odpovídajícího souboru InDesignu a na každé straně zkontrolujte vynechaný obsah i sazbu.
