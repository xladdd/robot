### Co to je?

Pomocí až šesti stylových referencí a promptu testovacího subjektu vytvořte znovupoužitelný prompt stylu. V každém kole vygenerujte tři testovací obrázky, hlasováním připněte jeden seed, dolaďte prompt a opakujte. Dokončit styl zobrazí zkontrolovaný prompt a seed; odeslání žádosti vytvoří úkol v Asaně s připraveným presetem, nikoli automatické nasazení.

### Jak to funguje?

Reference se přes OpenRouter posílají plánovači; revize mohou zahrnout i vybraný vygenerovaný obrázek. Testovací generování reference záměrně nepoužívá, takže ověřuje jen prompt a seed. Ruční úpravy promptu zůstávají upravitelné. Pevný seed nezaručuje shodný budoucí výstup.

Velikost testovacích obrázků vychází z původních rozměrů referencí v pixelech, nikoli ze zmenšených náhledů pro analýzu. Pokud mají všechny reference stejnou šířku a výšku, server požádá o tuto velikost, pokud poskytovatel uvádí její podporu; jinak požádá o nejbližší podporovaný poměr stran. Vrácený obrázek následně zkontroluje a podle potřeby na serveru změní na společné původní rozměry bez ořezu či deformace. Rozdílný poměr stran doplní bílými okraji. Zvětšení pixelů nepřidává nativní detail modelu. Při různých rozměrech referencí určí převládající podporovaný poměr stran deterministické hlasování a výsledné rozměry v pixelech stanoví poskytovatel. Odpověď uvádí nativní a konečné rozměry zvlášť; původní označení „1K“ není měřením pixelů. Úprava na přesné rozměry vyžaduje obrazová data přímo v odpovědi; výsledek obsahující pouze URL se odmítne a nestahuje. Limit rozměrů je 16 384 pixelů na každé straně a 40 megapixelů.

Podání do Asany obsahuje název a ID stylu, prompt, seed, testovací prompt, počet kol, volitelnou poznámku, uživatelské jméno Robotu a čas podání. Referenční ani vygenerované obrázky se do Asany neodesílají.
