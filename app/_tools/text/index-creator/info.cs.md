### Co to je?

Tvůrce rejstříku hledá zadaná slova i jejich gramatické tvary v rozsáhlém PDF učebnice.

Nahrajte PDF s živým textem, vložte na každý řádek jedno slovo nebo slovní spojení a vytvořte rejstřík. Prohlížeč doporučí pravděpodobné stránky a nejisté výskyty ponechá ke kontrole. Před kopírováním nebo stažením rejstříku můžete strany přijmout nebo odebrat.

Hotový rejstřík můžete zkopírovat oranžovým tlačítkem nebo stáhnout jako soubor MD či TXT.

Před použitím výsledku zkontrolujte automaticky rozpoznané číslování stran. Kotvu mezi stranou PDF a tištěnou stranou můžete opravit pod výstupem.

Hotový rejstřík vždy zkontrolujte. Jazyky jsou krásně nepořádné a místní řazení může neobvyklý tvar vynechat nebo zahrnout navíc. Výstup obsahuje jen strany, které jste přijali; sousední strany se zapisují jako rozsahy.

### Jak to funguje?

PDF.js čte živý text místně, stranu po straně, a hledá čísla tištěných stran u okrajů. Pokud má strana příliš málo použitelného textu, Tvůrce rejstříku ji také místně vykreslí a v prohlížeči spustí české OCR; shody z OCR se zobrazí mezi možnými stranami a nikdy se neposílají do OpenRouteru. Přes OpenRouter odchází pouze krátký seznam hesel do pevně zvoleného modelu Mistral Medium 3.5, který navrhne české, anglické, slovenské nebo rumunské gramatické tvary. Prohlížeč tyto úplné tvary ověří, místně je vyhledá na každé straně, seřadí důkazy a umožní vám výsledek zkontrolovat před sestavením tabulátorového rejstříku.
