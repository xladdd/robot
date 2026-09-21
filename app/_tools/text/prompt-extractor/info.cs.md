### Co to je?

Extraktor promptů vyhledá smysluplné ilustrace v rukopisu v PDF o rozsahu nejvýše 20 stran.

Extraktor oddělí samostatné obrazové prvky, zatímco záměrné skupiny ponechá pohromadě a doplní užitečný počet či uspořádání. Prompty vrací v pořadí stran zdrojového PDF a skupiny stran odděluje prázdným řádkem.

Prázdná místa, rámečky, loga, dekorace, komentáře a viditelný text ignoruje. Zachovává důležité viditelné barvy, počty, pózy a uspořádání. Hotový seznam můžete zkopírovat nebo stáhnout jako MD či TXT.

Prompty vždy porovnejte s rukopisem. Vizuální AI může ilustraci přehlédnout nebo nesprávně pochopit děj.

### Jak to funguje?

PDF.js místně zkontroluje počet stran a každou stranu vykreslí jako přehledový obrázek a zvětšené detailní pohledy. Textová vrstva PDF se neextrahuje ani neodesílá. Obrázky stran putují po jedné přes chráněnou serverovou cestu ke konfigurovanému vizuálnímu modelu na OpenRouteru, který obrazové prvky nejprve zaeviduje a poté ověří. Prohlížeč ověřené výsledky seskupí podle zdrojové strany a naformátuje je s prázdnými řádky mezi skupinami.
