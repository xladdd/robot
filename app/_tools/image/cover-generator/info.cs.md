### Co to je?

Generátor obálek vytváří nové obrazové podklady obálek učebnic podle dvou nebo tří existujících obálek, které určují vzhled řady.

Zvolte styl a kvalitu generování, popište nový námět a vytvořte dva nebo čtyři koncepty. Koncept, pro který hlasujete, se v další sadě použije jako dodatečná směrová reference; nechtěné koncepty můžete smazat.

Volba Ignorovat text v referenčních obrázcích odešle modelu výřezy zaměřené na obrazovou část, aby se méně kopírovaly názvy knih, označení ročníků a loga nakladatele. To může pomoci vytvořit čistší obrazovou část obálky.

Volitelná rešerše Shutterstock přijímá na každém řádku jeden vyhledávací dotaz nebo přímý odkaz Shutterstock. Náhledy jsou opatřené vodoznakem a bez licence; každý použitý zdroj je nutné před publikováním licencovat.

Po výběru konceptu automatické vytváření podkladů rozpozná hlavní objekty, nově vytvoří hlavní obálku ve 2K a každý rozpoznaný objekt vygeneruje jako samostatný izolovaný 2K podklad. Jde o nové výstupy AI, nikoli o přesně vytažené vrstvy z původních pixelů.

ZIP obsahuje koncepty, hlavní obálku ve 2K, samostatné podklady, metadata projektu a report v Markdownu s modelem, seedem, cenou a odkazy Shutterstock pro každou úlohu.

### Jak to funguje?

Referenční obrázky a zadání procházejí chráněnou serverovou cestou. Rychlé koncepty používají FLUX.2 Klein 4B v rozlišení 512 px, kvalitnější koncepty FLUX.2 Pro v 1K. Automatické rozpoznání objektů používá Mistral Small 2603; hlavní obálku a izolované podklady ve 2K vytváří FLUX.2 Pro. Neúspěšný koncept se jednou zkusí nahradit a úspěšné výsledky souběžných úloh zůstanou zachované. Cena a identifikátory generování z OpenRouteru se ukládají do reportu v ZIP.
