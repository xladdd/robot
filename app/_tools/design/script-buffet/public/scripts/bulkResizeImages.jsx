#target photoshop

app.displayDialogs = DialogModes.NO;

main();

function main() {
    var inputFolder = Folder.selectDialog(
        "Select folder containing PNG/JPG images"
    );

    if (!inputFolder) {
        return;
    }

    var size = showSizeDialog();

    if (!size) {
        return;
    }

    if (!size.width && !size.height) {
        alert("Enter at least a width or height.");
        return;
    }

    var files = inputFolder.getFiles(function (file) {
        return file instanceof File &&
            /\.(png|jpe?g)$/i.test(file.name);
    });

    if (files.length === 0) {
        alert("No PNG or JPG files found.");
        return;
    }

    var outputFolder = new Folder(
        inputFolder.fsName + "/" + getOutputFolderName(size)
    );

    if (!outputFolder.exists) {
        outputFolder.create();
    }

    var processed = 0;
    var errors = [];

    for (var i = 0; i < files.length; i++) {
        try {
            processImage(
                files[i],
                outputFolder,
                size.width,
                size.height
            );

            processed++;

        } catch (e) {
            errors.push(
                files[i].name +
                ": " +
                e.message +
                " [Line " +
                e.line +
                "]"
            );
        }
    }

    var message =
        "Done.\n\n" +
        "Processed: " +
        processed +
        " / " +
        files.length +
        "\n\nOutput:\n" +
        outputFolder.fsName;

    if (errors.length > 0) {
        message +=
            "\n\nErrors:\n" +
            errors.join("\n");
    }

    alert(message);
}


function showSizeDialog() {
    var dialog = new Window(
        "dialog",
        "Batch Resize Images"
    );

    dialog.orientation = "column";
    dialog.alignChildren = "fill";

    var widthGroup = dialog.add("group");

    widthGroup.add(
        "statictext",
        undefined,
        "Width (px):"
    );

    var widthInput = widthGroup.add(
        "edittext",
        undefined,
        ""
    );

    widthInput.characters = 10;


    var heightGroup = dialog.add("group");

    heightGroup.add(
        "statictext",
        undefined,
        "Height (px):"
    );

    var heightInput = heightGroup.add(
        "edittext",
        undefined,
        ""
    );

    heightInput.characters = 10;


    dialog.add(
        "statictext",
        undefined,
        "Leave one field empty to resize proportionally."
    );


    var buttons = dialog.add("group");

    buttons.alignment = "right";

    buttons.add(
        "button",
        undefined,
        "Cancel",
        { name: "cancel" }
    );

    buttons.add(
        "button",
        undefined,
        "Resize",
        { name: "ok" }
    );


    if (dialog.show() !== 1) {
        return null;
    }

    return {
        width: parseSize(widthInput.text),
        height: parseSize(heightInput.text)
    };
}


function parseSize(value) {
    value = value.replace(/px/gi, "");
    value = value.replace(/\s/g, "");

    if (value === "") {
        return null;
    }

    var number = parseInt(value, 10);

    if (isNaN(number) || number <= 0) {
        return null;
    }

    return number;
}


function getOutputFolderName(size) {
    var name = "resized";

    if (size.width) {
        name += " W" + size.width + "px";
    }

    if (size.height) {
        name += " H" + size.height + "px";
    }

    return name;
}


function processImage(
    file,
    outputFolder,
    targetWidth,
    targetHeight
) {
    var doc = app.open(file);

    try {
        var originalWidth = doc.width.as("px");
        var originalHeight = doc.height.as("px");

        var newWidth;
        var newHeight;
        var resampleMethod;


        // WIDTH ONLY

        if (targetWidth && !targetHeight) {
            newWidth = targetWidth;

            newHeight = Math.round(
                originalHeight *
                (targetWidth / originalWidth)
            );

            resampleMethod = getResampleMethod(
                originalWidth,
                originalHeight,
                newWidth,
                newHeight
            );

            doc.resizeImage(
                UnitValue(newWidth, "px"),
                UnitValue(newHeight, "px"),
                null,
                resampleMethod
            );
        }


        // HEIGHT ONLY

        else if (!targetWidth && targetHeight) {
            newHeight = targetHeight;

            newWidth = Math.round(
                originalWidth *
                (targetHeight / originalHeight)
            );

            resampleMethod = getResampleMethod(
                originalWidth,
                originalHeight,
                newWidth,
                newHeight
            );

            doc.resizeImage(
                UnitValue(newWidth, "px"),
                UnitValue(newHeight, "px"),
                null,
                resampleMethod
            );
        }


        // WIDTH + HEIGHT

        else {
            var scale = Math.min(
                targetWidth / originalWidth,
                targetHeight / originalHeight
            );

            newWidth = Math.round(
                originalWidth * scale
            );

            newHeight = Math.round(
                originalHeight * scale
            );

            resampleMethod = getResampleMethod(
                originalWidth,
                originalHeight,
                newWidth,
                newHeight
            );

            doc.resizeImage(
                UnitValue(newWidth, "px"),
                UnitValue(newHeight, "px"),
                null,
                resampleMethod
            );
        }


        // SUBTLE SHARPENING AFTER DOWNSCALING

        if (
            newWidth < originalWidth ||
            newHeight < originalHeight
        ) {
            applySharpening(doc);
        }


        // EXPAND CANVAS, THEN ADD WHITE BACKGROUND

if (targetWidth && targetHeight) {

    var oldColor = app.backgroundColor;

    var white = new SolidColor();
    white.rgb.red = 255;
    white.rgb.green = 255;
    white.rgb.blue = 255;

    app.backgroundColor = white;

    doc.resizeCanvas(
        UnitValue(targetWidth, "px"),
        UnitValue(targetHeight, "px"),
        AnchorPosition.MIDDLECENTER
    );

    app.backgroundColor = oldColor;
}

        saveImage(
            doc,
            file,
            outputFolder
        );

    } finally {
        doc.close(
            SaveOptions.DONOTSAVECHANGES
        );
    }
}


function getResampleMethod(
    originalWidth,
    originalHeight,
    newWidth,
    newHeight
) {
    if (
        newWidth < originalWidth ||
        newHeight < originalHeight
    ) {
        return ResampleMethod.BICUBICSHARPER;
    }

    return ResampleMethod.BICUBICSMOOTHER;
}


function applySharpening(doc) {
    var layer = doc.activeLayer;

    try {
        layer.applyUnSharpMask(
            35,
            0.4,
            1
        );

    } catch (e) {
        // Skip sharpening if unsupported
    }
}

function saveImage(
    doc,
    originalFile,
    outputFolder
) {
    var extensionMatch =
        originalFile.name.match(/\.([^.]+)$/);

    if (!extensionMatch) {
        throw new Error(
            "Could not determine file extension."
        );
    }

    var extension =
        extensionMatch[1].toLowerCase();

    var outputFile = new File(
        outputFolder.fsName +
        "/" +
        originalFile.name
    );


    // PNG

    if (extension === "png") {
        var pngOptions = new PNGSaveOptions();

        pngOptions.compression = 6;
        pngOptions.interlaced = false;

        doc.saveAs(
            outputFile,
            pngOptions,
            true,
            Extension.LOWERCASE
        );
    }


    // JPG / JPEG

    else {
        if (doc.mode !== DocumentMode.RGB) {
            doc.changeMode(ChangeMode.RGB);
        }

        var jpgOptions = new JPEGSaveOptions();

        jpgOptions.quality = 12;
        jpgOptions.embedColorProfile = true;

        jpgOptions.formatOptions =
            FormatOptions.STANDARDBASELINE;

        doc.saveAs(
            outputFile,
            jpgOptions,
            true,
            Extension.LOWERCASE
        );
    }
}