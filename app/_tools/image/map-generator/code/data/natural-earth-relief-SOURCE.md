# Natural Earth shaded relief

The Map Maker relief rasters are derived from **Natural Earth I with Shaded Relief**, 1:10 million high-resolution edition (`NE1_HR_LC_SR`). The app supplies vector water and clips this raster to land, so the much larger upstream variant with raster water is unnecessary.

- Source: https://www.naturalearthdata.com/downloads/10m-raster-data/10m-natural-earth-1/
- Download: https://naturalearth.s3.amazonaws.com/10m_raster/NE1_HR_LC_SR.zip
- Upstream file: `NE1_HR_LC_SR.tif` (21600 × 10800 px)
- Upstream last-modified date observed during import: 2021-09-08
- Natural Earth data is public domain: https://naturalearthdata.com/about/terms-of-use/

`../../scripts/import-natural-earth-relief.mjs` projects the equirectangular source into the four Map Maker projections at 6000 × 4200 px and writes compact JPEG assets. It retains a 12000 × 6000 oversampled working raster during projection rather than first collapsing the source to 5400 × 2700. The SVG renderer clips the raster to the bundled Natural Earth land geometry; water, borders, labels, peaks, and map ornaments remain vector layers.

Reproduction command after extracting the upstream TIFF:

```sh
node app/_tools/image/map-generator/scripts/import-natural-earth-relief.mjs \
  /path/to/NE1_HR_LC_SR.tif \
  app/_tools/image/map-generator/public \
  6000
```
