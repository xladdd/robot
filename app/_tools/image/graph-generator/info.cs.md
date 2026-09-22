### Co to je?

Popište graf a dodejte číselná data napsáním, vložením nebo importem prvního listu souboru Excel či CSV. Získáte upravitelný sloupcový, spojnicový, kombinovaný, bodový nebo prstencový graf ve formátu SVG, případně se zdroji a paletou Adobe Swatch Exchange.

### Jak to funguje?

Soubory Excel a CSV i barvy palety se načtou v prohlížeči. Pokyn pro graf a data se odešlou přes OpenRouter modelu `mistralai/mistral-large-2512 🇪🇺`, který strukturuje pouze vámi dodané hodnoty a zdroje. Robot vrácenou specifikaci ověří, deterministicky vypočítá měřítka a geometrii a vykreslí SVG, aniž by model data vyhledával nebo vymýšlel.
