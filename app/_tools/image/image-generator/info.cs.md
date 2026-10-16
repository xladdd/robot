### Co to je?

Zařaďte až 15 promptů napsaných nebo místně importovaných z DOCX, Markdownu či TXT, případně až se třemi referenčními obrázky. Vytvořte čtvercové obrázky, opakujte jednotlivé výsledky nebo je generativně zvětšete o jeden krok na 1K či 2K. Presety mohou doplnit prompt stylu a připnout seed.

### Jak to funguje?

Přes Robot do OpenRouteru se posílá jen text promptů a dodané referenční obrázky; importovaný dokument zůstává místně. Generování používá nakonfigurovaný obrázkový model, pokud v pokročilém režimu nezvolíte jiný. Zvětšení odešle vybraný obrázek ke generativnímu vytvoření, nikoli k pixelově shodnému zvětšení. Pevný seed může zlepšit opakovatelnost, nezaručuje však stejný výstup mezi poskytovateli, modely či verzemi.

Průhledné pozadí je nezaručené místní odstranění světlého pozadí propojeného s okrajem obrázku, nikoli obecná segmentace pomocí AI. Zkontrolujte okraje a světlé objekty. ZIP obsahuje průhledné verze jen u úspěšných výřezů, vedle originálů.

Příznak pokročilého režimu odhalí výběr modelu, tabulku kreditů a zdrojovou cestu presetů stylů. Vyberte model a případně ho porovnejte s druhým modelem; každý řádek promptu se pak vygeneruje jednou pro každý vybraný model.

Čipy parametrů přidávají strukturovaná pole — scénu, subjekty, osvětlení, náladu, pozadí, kompozici, barevnou paletu, kameru a seed — která se pro každý řádek sestaví do strukturovaného JSON promptu `FLUX`, prázdná pole se vynechají. Bez strukturovaného pole se každý řádek vygeneruje tak, jak je napsán, s připojeným textem stylu.

Zobrazené ceny jsou odhady; údaje o zbývajícím kreditu a měsíčním limitu nezaručují výslednou cenu ani dostupnost požadavku.
