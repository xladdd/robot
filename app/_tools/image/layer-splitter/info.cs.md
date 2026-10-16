### Co to je?

Rozdělte jeden obrázek do vrstev PSD pomocí rychlé nebo věrné rekonstrukce. Výsledek je odhad, nikoli obnovení původních zdrojových vrstev. Zkontrolujte varování: selhání segmentace či rekonstrukce může vést k vynechání objektů.

### Jak to funguje?

Zdrojový obrázek se dostane do OpenRouteru pro plánování scény, rozklad RGBA a doplnění chybějících masek. Běžné výřezy používají zdrojové RGB s odhadnutými maskami; vhodné osoby a zvířata se místo toho mohou znovu vytvořit jako celé subjekty, čímž se změní i viditelné RGB. Masky regenerovaných subjektů se hledají v opačném pořadí záložních modelů než běžné chybějící masky.

Čištění pozadí doplňuje místa po odstraněných objektech a stínech. Spodní vrstva Pozadí může zachovat otvory pro podpůrné plochy; neprůhlednost se kontroluje u složeného výsledku. Věrný režim může odhadnout skryté části objektů a regenerovat vhodné subjekty; při neplatné rekonstrukci se vrací ke zdrojovým výřezům. Rychlý režim skryté části nedokončuje. Ani jeden režim nezaručuje úplný inventář, přesnou anatomii či rekonstrukci shodnou se zdrojem. Klíčování a sestavení vrstevnatého PSD běží na serveru, který výsledek zabalí pomocí `ag-psd`.
