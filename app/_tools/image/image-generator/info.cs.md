### Co to je?

Zadejte až 15 promptů nebo je importujte ze souboru DOCX, Markdown či TXT a případně přidejte až tři referenční obrázky. Získáte samostatné čtvercové obrázky, které lze vygenerovat znovu, stáhnout nebo generativně zvětšit na další velikost.

### Jak to funguje?

Importované soubory s prompty se přečtou v prohlížeči a rozdělí podle prázdných řádků. Každý prompt a jeho volitelné reference se odešlou přes OpenRouter buď modelu `black-forest-labs/flux.2-klein-4b 🇩🇪` pro rychlý obrázek 512 px, nebo modelu `black-forest-labs/flux.2-pro 🇩🇪` pro obrázek 1K. Při zvětšení se vybraný obrázek odešle modelu `black-forest-labs/flux.2-pro 🇩🇪`, který jej znovu vytvoří ve velikosti 1K nebo 2K; původní importovaný dokument se neodesílá.
