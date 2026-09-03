### Co to je?

Importér řešení načte čisté PDF, redakční rukopis s anotacemi a odpovídající IDML a připraví pro InDesign operace textu, tabulek, značek a barev.

Kontrolní obrazovka oddělí spolehlivé operace od nejednoznačných anotací. Před stažením JSON odškrtněte chybné nálezy.

Pokud některé PDF obsahuje spadávku nebo tiskové značky, zapněte příslušnou volbu. Souřadnice strany InDesignu se pak určí podle vloženého TrimBoxu.

Zkontrolovaný JSON ve formátu `indesign-solutions-v2` se importuje jedním hlavním skriptem InDesignu. Po výběru a ověření JSON zobrazí skript dialog ScriptUI s volbou mezi **pokročilým** režimem, který zohledňuje rozvržení, a **jednoduchým** režimem, který vkládá text přímo podle souřadnic z PDF.

Pokročilý režim je doporučený pro kapitoly s tabulkami nebo strukturovanými poli odpovědí. Pokud selže nebo vytvoří špatný výsledek, vraťte import zpět a spusťte hlavní skript znovu v jednoduchém režimu; ten má méně předpokladů a je spolehlivější.

Netextové anotace, propojená grafika Illustratoru a Photoshopu a rastrové obrázky záměrně zůstávají k ruční úpravě.

### Jak to funguje?

Python, pdfplumber a parser IDML běží místně v Pyodide. Text čistého a anotovaného PDF se porovnává podle polohy, geometrie anotací PDF se klasifikuje konzervativně a IDML dodává metadata stran, tabulek, stylů, vzorníku a odkazů. Žádný dokument se nenahrává a nepoužívá se služba AI.
