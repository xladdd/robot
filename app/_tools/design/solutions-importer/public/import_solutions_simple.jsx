/* Place reviewed Solutions Importer text at its PDF coordinates.
 *
 * This intentionally ignores table and answer-box structure. It is the
 * failsafe importer: every enabled text operation becomes one text frame.
 */

#target "InDesign"

(function () {
    var TITLE = "Import Solutions (Simple)";
    var TEST_JSON_PATH = $.global.__SOLUTIONS_JSON_PATH__ || "";
    var LAYER_NAME = "SOLUTIONS";
    var TEXT_STYLE_NAME = "Solutions";
    var SWATCH_NAME = "SOLUTIONS";
    var GENERATED_PREFIX = "Solutions Simple:";
    var AUTOMATED = $.global.__SOLUTIONS_SIMPLE_AUTOMATED__ === true;

    if (!app.documents.length) {
        notify("Open the matching InDesign chapter before running this script.");
        return;
    }

    app.doScript(run, ScriptLanguage.JAVASCRIPT, undefined,
        UndoModes.ENTIRE_SCRIPT, TITLE);

    function run() {
        var jsonFile = TEST_JSON_PATH ? File(TEST_JSON_PATH) : null;
        if (!jsonFile || !jsonFile.exists)
            jsonFile = File.openDialog("Choose Solutions Importer JSON", "JSON:*.json");
        if (!jsonFile) return;

        var data = readJson(jsonFile);
        if (!data) return;
        if (data.format !== "indesign-solutions-v2" || !data.pages) {
            notify("This is not Solutions Importer JSON.");
            return;
        }

        var doc = app.activeDocument;
        if (data.pages.length !== doc.pages.length) {
            notify("Page-count mismatch.\n\nJSON: " + data.pages.length +
                "\nInDesign: " + doc.pages.length);
            return;
        }
        if (!confirmPageNames(doc, data)) return;

        var layer = ensureLayer(doc);
        var oldItems = collectGeneratedItems(layer);
        var swatch = ensureSolutionSwatch(doc);
        var typography = readTypography(data);
        var font = resolveFont(typography.fontFamily);
        if (!font) {
            notify('The selected font "' + typography.fontFamily + '" is not installed.');
            return;
        }
        var style = ensureParagraphStyle(doc, TEXT_STYLE_NAME, swatch, font,
            typography.pointSize);

        var oldH = doc.viewPreferences.horizontalMeasurementUnits;
        var oldV = doc.viewPreferences.verticalMeasurementUnits;
        var oldOrigin = doc.viewPreferences.rulerOrigin;
        var createdItems = [];
        var placed = 0;
        var skipped = 0;

        doc.viewPreferences.horizontalMeasurementUnits = MeasurementUnits.POINTS;
        doc.viewPreferences.verticalMeasurementUnits = MeasurementUnits.POINTS;
        doc.viewPreferences.rulerOrigin = RulerOrigin.PAGE_ORIGIN;

        try {
            layer.visible = true;
            layer.locked = false;
            for (var pageIndex = 0; pageIndex < data.pages.length; pageIndex++) {
                var page = doc.pages[pageIndex];
                var pageData = data.pages[pageIndex];
                var pageWidth = page.bounds[3] - page.bounds[1];
                var pageHeight = page.bounds[2] - page.bounds[0];
                var scaleX = pageWidth / Number(pageData.width);
                var scaleY = pageHeight / Number(pageData.height);
                var operations = pageData.operations || [];

                for (var operationIndex = 0; operationIndex < operations.length; operationIndex++) {
                    var operation = operations[operationIndex];
                    if (operation.enabled === false) continue;
                    if (operation.kind !== "text" || !operation.text ||
                            !operation.bounds || operation.bounds.length !== 4) {
                        skipped++;
                        continue;
                    }

                    var bounds = scaledBounds(operation.bounds, scaleX, scaleY);
                    var minimumHeight = typography.pointSize + 2;
                    bounds[0] = clamp(bounds[0], 0, Math.max(0, pageHeight - minimumHeight));
                    bounds[1] = clamp(bounds[1], 0, Math.max(0, pageWidth - 12));
                    bounds[2] = clamp(Math.max(bounds[2], bounds[0] + minimumHeight), bounds[0] + minimumHeight, pageHeight);
                    bounds[3] = clamp(Math.max(bounds[3], bounds[1] + 12), bounds[1] + 12, pageWidth);

                    var frame = page.textFrames.add(layer, undefined, undefined, {
                        geometricBounds: bounds,
                        contents: normalizeText(operation.text)
                    });
                    frame.label = GENERATED_PREFIX + operation.id;
                    makeFrameTransparent(frame, doc);
                    frame.textFramePreferences.insetSpacing = [0, 0, 0, 0];
                    frame.textFramePreferences.firstBaselineOffset = FirstBaseline.ASCENT_OFFSET;
                    frame.parentStory.paragraphs[0].appliedParagraphStyle = style;
                    try { frame.parentStory.paragraphs[0].justification = Justification.LEFT_ALIGN; } catch (_) {}
                    createdItems.push(frame);
                    placed++;
                }
            }
            removeItems(oldItems);
        } catch (error) {
            removeItems(createdItems);
            if (AUTOMATED) throw error;
            alert("Import failed. Previous Simple-import items were kept.\n\n" + error, TITLE);
            return;
        } finally {
            doc.viewPreferences.horizontalMeasurementUnits = oldH;
            doc.viewPreferences.verticalMeasurementUnits = oldV;
            doc.viewPreferences.rulerOrigin = oldOrigin;
        }

        if (!AUTOMATED) {
            alert("Simple Solutions import completed.\n\nText frames placed: " + placed +
                "\nNon-text operations skipped: " + skipped +
                "\n\nCheck the SOLUTIONS layer page by page.", TITLE);
        }
    }

    function readJson(file) {
        file.encoding = "UTF-8";
        if (!file.open("r")) {
            notify("Could not open: " + file.fsName);
            return null;
        }
        var raw = file.read().replace(/^\uFEFF/, "");
        file.close();
        try {
            if (typeof JSON !== "undefined" && JSON.parse) return JSON.parse(raw);
            return eval("(" + raw + ")");
        } catch (error) {
            notify("Could not parse the selected JSON.\n\n" + error);
            return null;
        }
    }

    function notify(message) {
        if (AUTOMATED) throw new Error(message);
        alert(message, TITLE);
    }

    function ensureLayer(doc) {
        var layer = doc.layers.itemByName(LAYER_NAME);
        if (!layer.isValid) layer = doc.layers.add({name: LAYER_NAME});
        layer.visible = true;
        layer.locked = false;
        return layer;
    }

    function ensureSolutionSwatch(doc) {
        var swatch = doc.colors.itemByName(SWATCH_NAME);
        if (!swatch.isValid) {
            swatch = doc.colors.add({
                name: SWATCH_NAME,
                model: ColorModel.PROCESS,
                space: ColorSpace.CMYK,
                colorValue: [100, 73, 0, 0]
            });
        }
        return swatch;
    }

    function readTypography(data) {
        var allowed = {"Arial": true, "Noto Sans": true, "Times New Roman": true};
        var family = data.settings && allowed[data.settings.font_family]
            ? data.settings.font_family : "Noto Sans";
        var size = data.settings ? Number(data.settings.point_size) : 14;
        if (size !== 12 && size !== 14) size = 14;
        return {fontFamily: family, pointSize: size};
    }

    function resolveFont(family) {
        var font;
        try {
            font = app.fonts.itemByName(family + "\tRegular");
            if (font.isValid) return font;
        } catch (_) {}
        for (var index = 0; index < app.fonts.length; index++) {
            try {
                font = app.fonts[index];
                if (String(font.fontFamily) === family &&
                        String(font.fontStyleName).toLowerCase() === "regular") return font;
            } catch (__) {}
        }
        return null;
    }

    function ensureParagraphStyle(doc, name, swatch, font, pointSize) {
        var style = doc.paragraphStyles.itemByName(name);
        if (!style.isValid) style = doc.paragraphStyles.add({name: name});
        style.appliedFont = font;
        try { style.fontStyle = font.fontStyleName; } catch (_) {}
        style.pointSize = pointSize;
        style.leading = pointSize;
        style.fillColor = swatch;
        style.spaceBefore = 0;
        style.spaceAfter = 0;
        style.justification = Justification.LEFT_ALIGN;
        return style;
    }

    function confirmPageNames(doc, data) {
        if (!data.document || !data.document.page_names) return true;
        var mismatches = [];
        for (var index = 0; index < doc.pages.length; index++) {
            if (String(doc.pages[index].name) !== String(data.document.page_names[index])) {
                mismatches.push((index + 1) + ": " + doc.pages[index].name +
                    " / " + data.document.page_names[index]);
                if (mismatches.length === 5) break;
            }
        }
        if (!mismatches.length) return true;
        return confirm("Some InDesign page names differ from the IDML used for extraction.\n\n" +
            mismatches.join("\n") + "\n\nContinue using PDF page order?");
    }

    function collectGeneratedItems(layer) {
        var items = layer.allPageItems;
        var result = [];
        for (var index = 0; index < items.length; index++) {
            try {
                if (String(items[index].label).indexOf(GENERATED_PREFIX) === 0)
                    result.push(items[index]);
            } catch (_) {}
        }
        return result;
    }

    function removeItems(items) {
        for (var index = items.length - 1; index >= 0; index--) {
            try { if (items[index].isValid) items[index].remove(); } catch (_) {}
        }
    }

    function makeFrameTransparent(frame, doc) {
        try { frame.fillColor = getNoneSwatch(doc); } catch (_) {}
        try { frame.strokeColor = getNoneSwatch(doc); } catch (__) {}
        try { frame.strokeWeight = 0; } catch (___) {}
    }

    function getNoneSwatch(doc) {
        var none;
        try {
            none = doc.swatches.itemByName("$ID/None");
            if (none.isValid) return none;
        } catch (_) {}
        try {
            none = doc.swatches.itemByName("None");
            if (none.isValid) return none;
        } catch (__) {}
        return doc.swatches[0];
    }

    function scaledBounds(bounds, scaleX, scaleY) {
        return [
            Number(bounds[0]) * scaleY,
            Number(bounds[1]) * scaleX,
            Number(bounds[2]) * scaleY,
            Number(bounds[3]) * scaleX
        ];
    }

    function clamp(value, minimum, maximum) {
        return Math.min(maximum, Math.max(minimum, value));
    }

    function normalizeText(text) {
        return String(text || "").replace(/[ \t]+/g, " ").replace(/^\s+|\s+$/g, "");
    }
})();
