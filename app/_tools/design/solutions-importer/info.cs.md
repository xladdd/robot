### Co to je?

Přidejte čisté PDF, odpovídající anotovaný rukopis v PDF a odpovídající IDML a poté zkontrolujte nalezené operace textu, tabulek, značek a barev. Získáte JSON ve formátu `indesign-solutions-v2`, který stažený skript InDesignu vloží pokročilým režimem podle rozvržení nebo jednoduchým režimem podle přímých souřadnic.

### Jak to funguje?

`PDF.js`, `Pyodide`, Python, `pdfplumber` a parser IDML běží v prohlížeči, porovnají PDF podle polohy a spojí rozdíly s metadaty stran, tabulek, stylů, vzorníku a odkazů. Vaše volby z kontroly se zapíší do JSON; žádný dokument se neodesílá a nepoužívá se model AI. Skript InDesignu JSON před použitím zvoleného režimu ověří. Pro tabulky a zarovnaná pole odpovědí použijte pokročilý režim; pokud selže, import vraťte zpět a spusťte skript znovu ve spolehlivějším jednoduchém režimu.
