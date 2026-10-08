### Co to je?

Koncept ilustrace promění článek ve tři stručné směry redakční ilustrace. Jeden směr vyberete a upravíte, vygenerujete jediný obrázek a dále jej zdokonalujete v přehledné historii revizí. Redaktor může aktivní revizi zkritizovat, schválit či zamítnout, připojit poznámku a uložit ji jako finální.

### Místní paměť a soukromí

Projekty, text článku, sestavené prompty, rozhodnutí, poznámky, revize obrázků a trvalý profil Styl domu se ukládají pomocí IndexedDB v tomto prohlížeči. Obrázky a komprimované stylové reference se ukládají jako datové URL, které mohou zabrat významnou část kvóty prohlížeče. Pokud úložiště není dostupné nebo je plné, aplikace zobrazí chybu paměti. Vymazáním dat webu či úložiště prohlížeče se smaže veškerá paměť nástroje Koncept ilustrace. Nic se nesynchronizuje do jiného prohlížeče ani zařízení.

### Zpracování AI a náklady

Plánování, sestavení promptu, generování obrázku, úpravy obrázku a kritika používají API Concept Illustrations a zpracovávají se přes OpenRouter. Text článku, písemné pokyny ke stylu, poměr stran a relevantní nedávné poznámky ke schválení či zamítnutí se podle potřeby odesílají při plánování nebo sestavení promptu. Referenční ilustrace stylu domu se odesílají při generování; první dvě také při požadavcích na úpravu obrázku. Aktivní vygenerovaný obrázek se odesílá také při úpravách a kritice.

Každé generování obrázku, úprava i výslovně spuštěná kritika mohou spotřebovat placené modelové prostředky. Kritika se nikdy nespouští automaticky a použití jejích oprav pouze vyplní pokyn k úpravě—novou revizi musíte potvrdit samostatně. Reference lze přidat jako PNG, JPEG nebo WebP do 30 MB; přímo v prohlížeči se komprimují do JPEG s maximální stranou 1600 px a poté se uloží místně do profilu Styl domu.
