/* Import reviewed Typesetter JSON into an existing InDesign template. */

#target "InDesign"

(function () {
    var TITLE = "Robot Typesetter";
    var MAIN_LABEL = "typesetter:story:main";
    var IMAGE_LAYER = "IMAGE REQUESTS";

    if (!app.documents.length) {
        alert("Open a copy of the matching InDesign template first.", TITLE);
        return;
    }

    app.doScript(run, ScriptLanguage.JAVASCRIPT, undefined,
        UndoModes.ENTIRE_SCRIPT, TITLE);

    function run() {
        var jsonFile = File.openDialog("Choose reviewed Typesetter JSON", "JSON:*.json");
        if (!jsonFile) return;
        var data = readJson(jsonFile);
        if (!data) return;
        if (data.format !== "indesign-typesetter-v1" || data.version !== 1 ||
                !data.blocks || typeof data.blocks.length !== "number") {
            alert("This is not supported Typesetter JSON.", TITLE);
            return;
        }
        if (data.summary && data.summary.unresolved > 0) {
            alert("The JSON still contains unresolved review items.", TITLE);
            return;
        }

        var doc = app.activeDocument;
        var mainFrame = findLabelledTextFrame(doc, MAIN_LABEL);
        if (!mainFrame) {
            alert("No text frame labelled " + MAIN_LABEL + " was found.\n\n" +
                "Select the first frame of the main threaded story and add the label in InDesign's Script Label panel.", TITLE);
            return;
        }

        var styles = validateStyles(doc, data);
        if (styles.errors.length) {
            alert("Import stopped before changing the document:\n\n" + styles.errors.join("\n"), TITLE);
            return;
        }

        var storedId = doc.extractLabel("typesetter:template:id");
        var storedVersion = doc.extractLabel("typesetter:template:version");
        if (storedId && storedId !== data.template.id) {
            alert("Template ID mismatch.\n\nJSON: " + data.template.id + "\nDocument: " + storedId, TITLE);
            return;
        }
        if (storedVersion && storedVersion !== data.template.version) {
            alert("Template version mismatch.\n\nJSON: " + data.template.version + "\nDocument: " + storedVersion, TITLE);
            return;
        }

        var story = mainFrame.parentStory;
        var imageLayer = ensureLayer(doc, IMAGE_LAYER);
        var placedText = 0;
        var placedImages = 0;
        var skipped = 0;
        var currentPage = mainFrame.parentPage || doc.pages[0];
        story.contents = "";

        for (var index = 0; index < data.blocks.length; index++) {
            var block = data.blocks[index];
            if (block.role === "unsupported") {
                skipped++;
                continue;
            }
            if (block.role === "image.request") {
                createImageRequest(doc, currentPage, imageLayer, block,
                    styles.paragraph[block.role], styles.object[block.role], placedImages);
                placedImages++;
                continue;
            }
            var start = story.characters.length;
            story.insertionPoints[-1].contents = String(block.text || "") + "\r";
            var end = story.characters.length - 2;
            if (end >= start) {
                story.characters.itemByRange(start, end).appliedParagraphStyle =
                    styles.paragraph[block.role];
            }
            placedText++;
            try {
                var frame = story.insertionPoints[-1].parentTextFrames[0];
                if (frame && frame.parentPage) currentPage = frame.parentPage;
            } catch (_) {}
        }

        doc.insertLabel("typesetter:template:id", data.template.id);
        doc.insertLabel("typesetter:template:version", data.template.version);
        var message = "Typesetter import completed.\n\n" +
            "Text blocks: " + placedText + "\n" +
            "Image requests: " + placedImages + "\n" +
            "Unsupported blocks skipped: " + skipped + "\n" +
            "Overset text: " + (story.overflows ? "YES" : "no") + "\n\n" +
            "Image request frames are unanchored on the " + IMAGE_LAYER + " layer. " +
            "Check the complete document before continuing.";
        alert(message, TITLE);
    }

    function validateStyles(doc, data) {
        var paragraph = {};
        var object = {};
        var errors = [];
        var mappings = data.mappings || {};
        for (var role in mappings) {
            if (!mappings.hasOwnProperty(role)) continue;
            var mapping = mappings[role] || {};
            if (mapping.paragraphStyle) {
                var paragraphStyle = resolveStyle(doc, "paragraph", mapping.paragraphStyle);
                if (!paragraphStyle) errors.push("Missing paragraph style: " + mapping.paragraphStyle);
                else paragraph[role] = paragraphStyle;
            }
            if (mapping.objectStyle) {
                var objectStyle = resolveStyle(doc, "object", mapping.objectStyle);
                if (!objectStyle) errors.push("Missing object style: " + mapping.objectStyle);
                else object[role] = objectStyle;
            }
        }
        for (var index = 0; index < data.blocks.length; index++) {
            var block = data.blocks[index];
            if (block.role !== "unsupported" && !paragraph[block.role])
                errors.push("No paragraph style mapping for role: " + block.role);
        }
        return {paragraph: paragraph, object: object, errors: unique(errors)};
    }

    function resolveStyle(doc, kind, path) {
        var parts = String(path).split("/");
        var name = parts.pop();
        var container = doc;
        var groups = kind === "paragraph" ? "paragraphStyleGroups" : "objectStyleGroups";
        var styles = kind === "paragraph" ? "paragraphStyles" : "objectStyles";
        for (var index = 0; index < parts.length; index++) {
            var group = container[groups].itemByName(parts[index]);
            if (!group.isValid) return null;
            container = group;
        }
        var style = container[styles].itemByName(name);
        return style.isValid ? style : null;
    }

    function findLabelledTextFrame(doc, label) {
        for (var index = 0; index < doc.textFrames.length; index++) {
            var frame = doc.textFrames[index];
            if (frame.label === label) return frame;
        }
        return null;
    }

    function ensureLayer(doc, name) {
        var layer = doc.layers.itemByName(name);
        if (!layer.isValid) layer = doc.layers.add({name: name});
        layer.visible = true;
        layer.locked = false;
        return layer;
    }

    function createImageRequest(doc, page, layer, block, paragraphStyle, objectStyle, offset) {
        if (!page) page = doc.pages[0];
        var bounds = page.bounds;
        var top = bounds[0] + (offset % 6) * 62;
        var left = bounds[3] + 18 + Math.floor(offset / 6) * 190;
        var spread = page.parent;
        var frame = spread.textFrames.add(layer);
        frame.geometricBounds = [top, left, top + 52, left + 172];
        frame.label = "typesetter:image:" + block.id;
        frame.contents = String(block.id) + "\r" + String(block.imagePrompt || block.text || "Image request");
        frame.textFramePreferences.insetSpacing = [6, 6, 6, 6];
        frame.parentStory.appliedParagraphStyle = paragraphStyle;
        if (objectStyle) frame.appliedObjectStyle = objectStyle;
    }

    function unique(values) {
        var result = [];
        for (var index = 0; index < values.length; index++) {
            if (result.indexOf(values[index]) < 0) result.push(values[index]);
        }
        return result;
    }

    function readJson(file) {
        file.encoding = "UTF-8";
        if (!file.open("r")) {
            alert("Could not open: " + file.fsName, TITLE);
            return null;
        }
        var raw = file.read().replace(/^\uFEFF/, "");
        file.close();
        try {
            if (typeof JSON !== "undefined" && JSON.parse) return JSON.parse(raw);
            return eval("(" + raw + ")");
        } catch (error) {
            alert("Could not parse the selected JSON.\n\n" + error, TITLE);
            return null;
        }
    }
}());
