### Co to je?

Zadejte až 15 promptů nebo je importujte ze souboru DOCX, Markdown či TXT a případně přidejte až tři referenční obrázky. Získáte samostatné čtvercové obrázky, které lze vygenerovat znovu, stáhnout nebo generativně zvětšit na další velikost. Rozbalovací nabídka **Výtvarné zpracování** v ovládacích prvcích připojí k zadání jeden ze dvou pohádkových stylových promptů.

### Jak to funguje?

Importované soubory s prompty se přečtou v prohlížeči a rozdělí podle prázdných řádků. Každý prompt a jeho volitelné reference se odešlou přes OpenRouter buď modelu `black-forest-labs/flux.2-klein-4b 🇩🇪` pro rychlý obrázek 512 px, nebo modelu `black-forest-labs/flux.2-pro 🇩🇪` pro obrázek 1K. Při zvětšení se vybraný obrázek odešle modelu `black-forest-labs/flux.2-pro 🇩🇪`, který jej znovu vytvoří ve velikosti 1K nebo 2K; původní importovaný dokument se neodesílá.

### Pokročilý režim

Přepínačem režimu nahoře v ovládacím panelu přepnete na **Pokročilý** režim, který sestavuje strukturovaný FLUX JSON prompt: opakovatelné subjekty s popisem, pozicí a akcí, dále scénu, styl, volný prompt, osvětlení, náladu, pozadí, kompozici, barevnou paletu a nastavení kamery. Pod polem stylu je rozbalovací nabídka **Výtvarné zpracování** s hotovými stylovými prompty (zpracování z Generátoru obálek plus dvě pohádkové přednastavené styly, které také nastaví seed na 8701); výběr jednoho z nich vyplní pole stylu a jeho použití je volitelné. Rozbalovací nabídka modelu obsahuje aktuálně dostupné obrazové modely FLUX na OpenRouter, vedle ní je cena za obrázek, kredit zbývající na klíči aplikace zobrazený s měsíčním limitem a — pokud je nastavena proměnná `OPENROUTER_MANAGEMENT_API_KEY` — plný zůstatek účtu v buňce **Účet**. Pole od osvětlení po kameru jsou skryta v rozbalovací sekci **Pokročilé detaily** a zobrazí se až po rozbalení. Nad tlačítkem generování je volitelný **seed** (0–2 000 000 000); prázdné pole znamená náhodný seed a pevný seed reprodukuje stejný obrázek ze stejných vstupů. Prázdná pole se z JSON vynechají a sestavený prompt se odešle vybranému modelu; obrázek se zobrazí ve stejné galerii jako výsledky výchozího režimu.

Celý pokročilý režim lze vypnout příznakem `advancedMode` u položky Generátoru obrázků v `app/_tools/registry.ts`; když je `false`, přepínač režimu ani pokročilý panel se vůbec nezobrazí.
