### Co to je?

Importér řešení načte čisté PDF, redakční rukopis s anotacemi a odpovídající IDML a připraví pro InDesign operace textu, tabulek, značek a barev.

Kontrolní obrazovka oddělí spolehlivé operace od nejednoznačných anotací. Před stažením JSON odškrtněte chybné nálezy.

Pokud některé PDF obsahuje spadávku nebo tiskové značky, zapněte příslušnou volbu. Souřadnice strany InDesignu se pak určí podle vloženého TrimBoxu.

Stejný zkontrolovaný JSON funguje se dvěma skripty InDesignu. **Jednoduchý** vloží každou nalezenou textovou operaci na její souřadnice z PDF. **Pokročilý** navíc rozpoznává pole odpovědí a buňky tabulek, kopíruje odpovídající struktury tabulek a zarovnává pokračování textu.

Pokročilý skript použijte pro kapitoly s tabulkami nebo strukturovanými poli odpovědí. Pokud selže nebo vytvoří špatný výsledek, vraťte import zpět a zkuste jednoduchý; má méně předpokladů a je spolehlivější.

Propojená grafika Illustratoru, Photoshopu a rastrové obrázky záměrně zůstávají k ruční úpravě.

### Jak to funguje?

Python, pdfplumber a parser IDML běží místně v Pyodide. Text čistého a anotovaného PDF se porovnává podle polohy, geometrie anotací PDF se klasifikuje konzervativně a IDML dodává metadata stran, tabulek, stylů, vzorníku a odkazů. Žádný dokument se nenahrává a nepoužívá se služba AI.
