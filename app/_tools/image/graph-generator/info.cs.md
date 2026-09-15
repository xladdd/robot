### Co to je?

Generátor grafů převádí dodaná číselná data na upravitelný sloupcový, spojnicový, kombinovaný, bodový nebo prstencový graf ve formátu SVG.

Do pokynu uveďte název, hodnoty a jednotky. Můžete doplnit pojmenované zdroje a také importovat vzorník Adobe Swatch Exchange.

Generátor zachová zadaná čísla a vrátí SVG i protokol kontroly. Před publikováním graf vždy porovnejte s původním zdrojem.

### Jak to funguje?

Text prochází chráněnou serverovou cestou do pevně zvoleného modelu, který smí pouze strukturovat výslovně dodané hodnoty a zdroje. Nesmí data vyhledávat, odhadovat ani doplňovat. Vrácená specifikace se ověří a deterministický kód vypočítá osy a vykreslí požadovaný graf. Sloupcové a spojnicové grafy používají zaokrouhlené automatické značky; kombinované grafy mohou mít nezávislé osy y a regresní přímky i geometrie prstenců se počítají lokálně.
