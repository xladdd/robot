### Co to je?

Generátor obálek je levný nástroj pro zkoušení odlišných obrazových směrů obálek učebnic bez textu.

Zvolte cílovou skupinu a předmět a případně přidejte několik klíčových slov s tématem nebo stylem. Nemusíte psát podrobné výtvarné zadání: malý plánovací model s podporou obrazu převede stručné vstupy na několik různých vizuálních konceptů. Referenční obálky jsou volitelné a určují obecný charakter pro cílovou skupinu, paletu, dokončení a energii, ale nekopírují se jako rozvržení.

Výstupem je pouze obrazový motiv. Nežádejte názvy, označení ročníků, loga, popisky, odznaky ani další typografii; tyto prvky se doplní později v InDesignu. Tlačítko `?` nad klíčovými slovy vysvětluje, jak napsat krátký a účinný vstup.

K dispozici jsou dva levné obrazové modely: výchozí FLUX.2 Klein v rozlišení 512 px a alternativní Gemini Flash Lite v rozlišení 1K s odlišným vizuálním stylem. Plánovač používá `mistralai/mistral-small-2603`, rozumí českému i anglickému textu a umí prohlédnout volitelné referenční obrázky. Tento nástroj vytváří pouze nápady; oddělení vrstev zajišťuje Layer Splitter.

### Jak to funguje?

Cílová skupina, předmět, volitelná klíčová slova, výřezy referenčních obálek zaměřené na obraz a případný oblíbený předchozí koncept nejdříve projdou chráněným plánovačem. Ten shrne reference jako obecné stylové vodítko a vrátí přesně dva nebo čtyři strukturálně odlišné plány. Obrazový model pak dostane pro každý obrázek jiný plán a ve výchozím nastavení nedostává surové reference, takže se z referenční obálky nestane opakovaná předloha. FLUX používá pro každý výsledek nezávislý náhodný seed; Gemini nastavení seedu neposkytuje. Neúspěšné obrazové úlohy se jednou zkusí nahradit a cena i identifikátory plánovače a obrazového generování jsou součástí reportu v ZIP.
