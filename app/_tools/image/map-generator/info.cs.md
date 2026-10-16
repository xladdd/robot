### Co to je?

Map Maker vytváří editovatelná SVG pro tiskovou a redakční práci. Otevírá se v současném roce se záměrně uzamčeným ovládáním roku; historická data zatím nelze v rozhraní zvolit, přestože historické API a přibalená data časové osy existují.

### Jak to funguje?

Uvnitř oranžového výřezu mapu posouvejte tažením a přibližujte kolečkem nebo tlačítky. Zvolte předvolbu politické, fyzické, historické, klimatické nebo slepé mapy a potom dolaďte jednotlivé vrstvy. Hustoty popisků Základní, Standardní a Podrobná ovládají kolizní rozvržení. Přesunout popisy umožňuje přetáhnout jednotlivé popisky; Skrýt popisy vybrané popisky odstraní. Kreslení přidává symboly, text a trasy.

Pro export s fyzickou velikostí písma, tloušťkami čar a rozměry legendy vyberte sloupec 90 mm, půlstranu 135 mm nebo celou stranu 180 mm. Před exportem doplňte název, podnázev, zdroj, poznámku k zobrazení a autorská práva. Kontrola pro publikaci upozorňuje na velikost tisku, chybějící zdroj či datum, barvy RGB, nedostupnou Verdanu, popisky přesahující výřez, příliš mnoho vrstev a kombinaci podkladů z různých období. Stáhnout SVG vyexportuje viditelný výřez s úpravami, pojmenovanými vrstvami, publikačními metadaty a fyzickými rozměry.

Volitelné úpravy promptem používají nakonfigurovaný model přes OpenRouter. Po použití promptu server odešle váš pokyn, aktuální rok mapy a názvy území dostupných pro daný rok. AI tento omezený kontext interpretuje jako řízené vybarvení území a jednoduché popisky. Každou navrženou operaci před použitím zkontrolujte a vyberte; použité i zamítnuté požadavky zůstávají v historii relace. Běžné anglické, české a historické varianty názvů se před přesným přiřazením normalizují. AI mapu nevykresluje a polygony vytvořené modelem se nepřijímají. Geometrii, kartografické zobrazení, vrstvy, výřez a SVG vykresluje deterministicky kód aplikace z přibalených mapových dat. Stejná data, rok, nastavení a kód dávají stejný výstup.

Základní mapa, jezera, řeky a současné státy používají přibalená data Natural Earth 1:10m. Historická podpora používá Cliopatrii před rokem 1886, CShapes od roku 1886 po stav k 1. lednu 2018 a současnou geometrii pro roky 2019–2026. Pro roky před rokem 1000 může vrstva měst používat sídla z gazetteeru Pleiades, která ve zvoleném roce existovala.

Volitelné vrstvy terénu, pohoří, vrcholů, řek, jezer, sporných hranic a klimatu mohou popisovat současnost nebo referenční období, nikoli zvolený politický rok.

Předvolba Fyzická kombinuje tlumené zbarvení terénu se stínovaným reliéfem Natural Earth I oříznutým podle pevniny a malými trojúhelníkovými značkami vrcholů Natural Earth s nadmořskou výškou. Čtyřdílné grafické měřítko se zobrazuje v levém dolním rohu u každé předvolby mapy. Reliéf je rastrová vrstva, zatímco politická geografie, popisky, vrcholy, vodstvo a mapové prvky zůstávají editovatelnými vektory; samostatné exporty SVG obrázek reliéfu vkládají přímo do souboru.

Klima používá pět editovatelných obrysových cest odvozených z klasifikace Beck et al. s vysokým rozlišením pro období 1980–2016; barevný klíč se při zapnutí zobrazí v legendě mapy.

Pokrytí zdrojů, názvy, datace i hranice mohou být neúplné nebo sporné. Před publikací mapu redakčně zkontrolujte a ověřte v tiskovém pracovním postupu.
