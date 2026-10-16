### Co to je?

Místně porovnejte čisté PDF, odpovídající anotovaný rukopis PDF a IDML a zkontrolujte navržené textové odpovědi. Stáhněte JSON `indesign-solutions-v2` a jediný importér InDesignu, `/solutions/import_solutions.jsx`. V dialogu skriptu zvolte pokročilou nebo jednoduchou strategii. Obě vkládají pouze text: neobnovují libovolné ruční značky, kresby ani změny barev.

### Jak to funguje?

`PDF.js` a zpracování `Python`/IDML v prohlížeči porovnají polohy a získají podpůrná metadata stran, tabulek a stylů. Dokumenty zůstávají místně; runtime prohlížeče a závislosti se mohou stahovat. Model AI se nepoužívá. Pokročilá strategie rozpoznává tabulky, zarovnává odpovědi do polí a umisťuje jejich pokračování; jednoduchá vytváří pouze textové rámečky podle přímých souřadnic a je spolehlivější záložní volbou. Při selhání pokročilého importu jej vraťte zpět a na kopii zkuste jednoduchý.

Pokročilá strategie nahradí všechny objekty ve vrstvě `SOLUTIONS`, včetně ručně přidaných. Jednoduchá odstraní jen svůj dříve označený výstup. Obě strategie mohou také aktualizovat styly. Dokument zálohujte, prohlédněte JSON a zkontrolujte každou importovanou stranu.
