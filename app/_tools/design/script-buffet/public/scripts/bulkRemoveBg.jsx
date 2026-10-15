#target photoshop

app.bringToFront();
app.displayDialogs = DialogModes.NO;

(function () {
    var inputFolder = Folder.selectDialog("Select the folder containing PNG/JPG files");
    if (!inputFolder) {
        alert("No folder selected. Script cancelled.");
        return;
    }

    var files = inputFolder.getFiles(function (f) {
        return f instanceof File && /\.(png|jpe?g)$/i.test(f.name);
    });

    if (!files.length) {
        alert("No PNG, JPG, or JPEG files found in the selected folder.");
        return;
    }

    var processed = 0;
    var failed = [];

    for (var i = 0; i < files.length; i++) {
        var file = files[i];

        try {
            var doc = app.open(file);

            // Target the top layer
            doc.activeLayer = doc.layers[0];

            // Unlock if it is a background layer
            try {
                if (doc.activeLayer.isBackgroundLayer) {
                    doc.activeLayer.name = "Layer 0";
                }
            } catch (e1) {
                try {
                    doc.backgroundLayer.name = "Layer 0";
                } catch (e2) {}
            }

            // Remove background
            executeAction(stringIDToTypeID("removeBackground"), undefined, DialogModes.NO);

            // Convert to CMYK
            if (doc.mode !== DocumentMode.CMYK) {
                doc.changeMode(ChangeMode.CMYK);
            }

            // Save as PSD with same base name in same folder
            var baseName = file.name.replace(/\.[^\.]+$/, "");
            var saveFile = new File(file.path + "/" + baseName + ".psd");

            var psdOptions = new PhotoshopSaveOptions();
            psdOptions.layers = true;
            psdOptions.embedColorProfile = true;
            psdOptions.alphaChannels = true;
            psdOptions.annotations = true;
            psdOptions.spotColors = true;

            doc.saveAs(saveFile, psdOptions, true, Extension.LOWERCASE);

            // Close without changing original file
            doc.close(SaveOptions.DONOTSAVECHANGES);

            processed++;

        } catch (err) {
            failed.push(file.name + " — " + err.message);

            try {
                if (app.documents.length) {
                    app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
                }
            } catch (closeErr) {}
        }
    }

    var msg = "Done.\n\nProcessed: " + processed + " file(s)";
    if (failed.length) {
        msg += "\nFailed: " + failed.length + "\n\n" + failed.join("\n");
    }

    alert(msg);
})();