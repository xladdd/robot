### Co to je?

Generátor grafů převádí dodaná číselná data na upravitelný sloupcový, spojnicový, kombinovaný, bodový nebo prstencový graf ve formátu SVG.

Graf popište v poli Pokyn. Hodnoty napište nebo vložte do pole Data, případně do něj přetáhněte soubor Excel (`.xlsx`) či CSV; první list se převede na upravitelnou tabulku Markdown. Můžete doplnit pojmenované zdroje a importovat vzorník Adobe Swatch Exchange.

Generátor zachová zadaná čísla. Před publikováním graf vždy porovnejte s původním zdrojem.

### Jak to funguje?

Pokyn a data procházejí chráněnou serverovou cestou do pevně zvoleného modelu, který smí pouze strukturovat výslovně dodané hodnoty a zdroje. Nesmí data vyhledávat, odhadovat ani doplňovat. Vrácená specifikace se ověří pro bezpečné vykreslení a deterministický kód vypočítá osy a vykreslí požadovaný graf. Sloupcové a spojnicové grafy používají zaokrouhlené automatické značky; kombinované grafy mohou mít nezávislé osy y a regresní přímky i geometrie prstenců se počítají lokálně.
