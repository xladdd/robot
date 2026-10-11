### Co to je?

Nahrajte jeden obrázek a zvolte rychlou nebo věrnou rekonstrukci. Získáte vrstvené PSD s úplným pozadím a samostatnými průhlednými vrstvami objektů v popředí, včetně vygenerovaných odhadů částí skrytých ve zdroji.

### Jak to funguje?

Zdrojový obrázek se přes OpenRouter odešle modelu `mistralai/mistral-large-4-0` na evropském endpointu Mistralu, který určí viditelné objekty a pořadí vrstev. `inclusionai/ming-image-0.1-design-layer` poté rozloží obrázek na RGBA výřezy. Robot použije pouze alfa masky z Mingu — nikoli jeho vygenerované RGB — a extrahuje původní RGB i alfa kanál z dodaného zdroje. Chybějící nebo nespárované výřezy obkreslí `qwen/qwen3.7-flash`, s ověřeným záložním modelem `google/gemini-3.6-flash`. Robot přiřadí každý překrývající se zdrojový pixel nejvyššímu objektu a při selhání segmentace nikdy nepoužije náhradní obdélníkovou masku.

Pro pozadí Robot vyhledá každou souvislou oblast skrytou extrahovanými objekty a odešle kontextový výřez s průhledným otvorem modelu `bytedance-seed/seedream-5-0-flash` (Rychlá) nebo `bytedance-seed/seedream-5-0-pro` (Věrná). Vygenerované pixely se zkopírují pouze přes přesnou binární masku odstranění, takže zdrojové pixely mimo otvory zůstanou beze změny. Ve věrném režimu může `openai/gpt-image-2.5-sunburst` vytvořit průhledné pokračování skutečně zakrytých objektů, přičemž viditelné zdrojové pixely zůstanou nahoře. Robot vrstvy ověří a složí a `ag-psd` sestaví PSD ke stažení.
