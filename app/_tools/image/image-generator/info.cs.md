### Co to je?

Generátor obrázků vytváří čtvercové obrázky do učebnic z jednoho nebo více textových zadání. Volitelně můžete přidat až tři referenční obrázky, které určí výtvarný styl nebo podobu objektu.

### Jak funguje fronta?

Napište jedno zadání nebo více zadání oddělených prázdným řádkem. Robot zařadí do fronty nejvýše 15 zadání a spouští je v pořadí. Můžete zvolit generování jednoho, dvou nebo tří obrázků současně; výchozí je jeden. Tlačítko ukazuje počet obrázků a rozpracované i zbývající úlohy můžete kdykoli zastavit.

Například:

```text
husa

chlapec

pes
```

vytvoří tři samostatné obrázky.

### Mohu obrázek opakovat nebo zvětšit?

Karta s neúspěšným obrázkem obsahuje akci **Opakovat**, která znovu odešle pouze tento obrázek bez opakování úspěšných položek fronty. Každý hotový obrázek má akci **Zvětšit 2×**. Používá úpravu obrazu FLUX.2 Pro a vytvoří další velikost: z 512 px vznikne 1K a z 1K vznikne 2K.

Zvětšení je generativní vylepšení, nikoli matematicky přesné zvětšení pixelů. Zadání vyžaduje zachování kompozice a detailů, jemná textura se ale může změnit. Maximální výstup je čtvercový obrázek 2K.

### Mohu zadání importovat?

Ano. Přetáhněte kamkoli do aplikace soubor Word (`.docx`), Markdown (`.md`) nebo text (`.txt`), případně použijte tlačítko pro import. Prázdné řádky v dokumentu oddělují zadání. Starší soubory `.doc` je nejprve nutné uložit jako `.docx`.

### Co opouští prohlížeč?

Aktuální zadání a volitelné referenční obrázky se odešlou službě OpenRouter pro vygenerování. Text importovaného dokumentu se načte místně v prohlížeči; původní soubor dokumentu se neodesílá. Generátor obrázků používá vlastní serverový API klíč OpenRouter.
