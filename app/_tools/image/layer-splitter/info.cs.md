### Co to je?

Nahrajte jeden obrázek a zvolte rychlou nebo věrnou rekonstrukci. Získáte vrstvené PSD s úplným pozadím a samostatnými průhlednými vrstvami objektů v popředí, včetně vygenerovaných odhadů částí skrytých ve zdroji.

### Jak to funguje?

Zdrojový obrázek se přes OpenRouter odešle modelu `mistralai/mistral-large-4-0` na evropském endpointu Mistralu, který určí viditelné objekty a pořadí vrstev. `inclusionai/ming-image-0.1-design-layer` poté rozloží obrázek na RGBA výřezy. Robot použije pouze alfa masky z Mingu — nikoli jeho vygenerované RGB — a extrahuje původní RGB i alfa kanál z dodaného zdroje. Chybějící nebo nespárované výřezy obkreslí `qwen/qwen3.7-flash`, s ověřeným záložním modelem `google/gemini-3.6-flash`. Robot přiřadí každý překrývající se zdrojový pixel nejvyššímu objektu a při selhání segmentace nikdy nepoužije náhradní obdélníkovou masku.

Pro pozadí Robot určí siluety objektů společně s jejich vrženými a kontaktními stíny a vytvoří větší masku určenou jen k vyčištění pozadí. Kontextové výřezy s vymazanými oblastmi odešle modelu `bytedance-seed/seedream-5-0-flash` (Rychlá) nebo `bytedance-seed/seedream-5-0-pro` (Věrná); vnitřní prolínání okraje spojí vygenerovanou texturu s nezměněnými zdrojovými pixely mimo čištěnou oblast. Ve věrném režimu Robot kombinuje překryvy určené modelem s geometrií masek a požádá `openai/gpt-image-2.5-sunburst` o tři průhledné kandidáty dokončení s využitím zdrojového výřezu i původního kontextu scény. Kandidáty vyhodnotí podle shody viditelných pixelů a návaznosti siluety, barevně upraví nejlepší skrytou část, ořízne ji pod zakrývající vrstvy a při neplatném výsledku bezpečně ponechá původní výřez. `ag-psd` zapíše neprůhledné Pozadí dospodu vrstev PSD.
