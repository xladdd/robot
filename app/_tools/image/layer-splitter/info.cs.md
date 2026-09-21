# Co je to?

Rozdělovač vrstev převede jeden dodaný obrázek na přibližně rekonstruovaný dokument Photoshopu. OpenRouter nejprve analyzuje scénu, poté vytvoří úplné pozadí a jednu úplnou průhlednou vrstvu pro každý důležitý objekt v popředí.

Nejnižší vrstva PSD je obraz přes celé plátno, ze kterého jsou odstraněny objekty v popředí a viditelný text. Vrstvy objektů obsahují i věrohodně doplněné skryté části, takže po skrytí pera uvidíte pod ním dokončenou knihu, nikoli prázdný výřez.

## Kvalita a cena

Rychlá volba používá `black-forest-labs/flux.2-klein-4b` v nižším rozlišení a je úspornější. Věrná volba používá `black-forest-labs/flux.2-pro` ve vyšším rozlišení. Cena závisí na počtu rozpoznaných objektů, protože pro každý objekt a pro pozadí je potřeba samostatné generování obrázku.

## Důležité omezení

Skrytý obsah se vytváří podle viditelných informací; ze zdroje se neobnovuje. Výsledná kompozice proto nebude pixelově totožná s dodaným obrázkem. Text, popisky, loga a vodoznaky se z plánu vrstev a z instrukcí pro generování vylučují, ale obrazový model může někdy zanechat drobné znaky nebo písmo.

FLUX vrací obrázky, nikoli vrstvené PSD soubory nebo zaručeně průhledné PNG. Aplikace proto průhlednost objektů vytvoří lokálně z generovaných obrazů s barevným klíčem a PSD sestaví lokálně. Pokud objekt nelze spolehlivě oddělit, export se odmítne místo tichého vytvoření vadné vrstvy.
