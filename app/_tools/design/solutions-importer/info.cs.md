### Co to je?

Místně porovnejte čisté PDF, odpovídající anotovaný rukopis PDF a IDML a zkontrolujte navržené textové odpovědi. Stáhněte JSON indesign-solutions-v2 a pokročilý nebo jednoduchý importér InDesignu. Oba importéry vkládají pouze text: neobnovují libovolné ruční značky, kresby ani změny barev.

### Jak to funguje?

PDF.js a zpracování Python/IDML v prohlížeči porovnají polohy a získají podpůrná metadata stran, tabulek a stylů. Dokumenty zůstávají místně; runtime prohlížeče a závislosti se mohou stahovat. Model AI se nepoužívá. Pokročilý importér zohledňuje rozvržení tabulek a odpovědí; jednoduchý vytváří textové rámečky podle přímých souřadnic. Při selhání pokročilého importu jej vraťte zpět a na kopii zkuste jednoduchý.

Pokročilý importér nahradí všechny objekty ve vrstvě SOLUTIONS, včetně ručně přidaných. Jednoduchý odstraní jen svůj dříve označený výstup. Importéry mohou také aktualizovat styly. Dokument zálohujte, prohlédněte JSON a zkontrolujte každou importovanou stranu.
