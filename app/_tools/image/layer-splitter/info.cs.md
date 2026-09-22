### Co to je?

Nahrajte jeden obrázek a zvolte rychlou nebo věrnou rekonstrukci. Získáte vrstvené PSD s úplným pozadím a samostatnými průhlednými vrstvami objektů v popředí, včetně vygenerovaných odhadů částí skrytých ve zdroji.

### Jak to funguje?

Zdrojový obrázek se odešle přes OpenRouter modelu `mistralai/mistral-small-2603 🇪🇺`, který určí užitečné vrstvy. Robot poté požádá model `black-forest-labs/flux.2-klein-4b 🇩🇪` nebo `black-forest-labs/flux.2-pro 🇩🇪` o samostatnou rekonstrukci pozadí a jednotlivých objektů. `sharp` odstraní vygenerovaná pozadí s barevným klíčem, Robot vrstvy ověří a složí a `ag-psd` sestaví PSD ke stažení.
