#target "indesign"

  (function () {
      if (app.selection.length === 0) {
          alert("Select one or more objects first.");
          return;
      }

      var selectedBlendMode = null;
      var focusOpacityOnKeyUp = false;
      var replaceOpacityOnNextType = false;

      var win = new Window("dialog", "Blend Mode + Opacity");
      win.orientation = "column";
      win.alignChildren = ["fill", "top"];

      var info = win.add("statictext", undefined, "Press M for Multiply or S for Screen");

      var row = win.add("group");
      row.orientation = "row";

      var multiplyBtn = row.add("button", undefined, "Multiply");
      var screenBtn = row.add("button", undefined, "Screen");

      var opacityGroup = win.add("group");
      opacityGroup.orientation = "row";
      opacityGroup.add("statictext", undefined, "Opacity %:");

      var opacityInput = opacityGroup.add("edittext", undefined, "100");
      opacityInput.characters = 5;
      opacityInput.enabled = false;

      var applyBtn = win.add("button", undefined, "Apply", { name: "ok" });
      applyBtn.enabled = false;

      function consumeKeyEvent(event) {
          try {
              event.preventDefault();
          } catch (error) {
          }

          try {
              event.stopPropagation();
          } catch (error) {
          }
      }

      function handleKey(event) {
          var key = event.keyName ? event.keyName.toUpperCase() : "";

          if (!selectedBlendMode) {
              if (key === "M") {
                  consumeKeyEvent(event);
                  setBlendMode(BlendMode.MULTIPLY, false);
                  focusOpacityOnKeyUp = true;
                  return;
              } else if (key === "S") {
                  consumeKeyEvent(event);
                  setBlendMode(BlendMode.SCREEN, false);
                  focusOpacityOnKeyUp = true;
                  return;
              }
          }

          if (key === "ENTER" || key === "RETURN") {
              if (selectedBlendMode) {
                  consumeKeyEvent(event);
                  applyOpacityAndClose();
              }
          }
      }

      function handleKeyUp(event) {
          if (!focusOpacityOnKeyUp) {
              return;
          }

          focusOpacityOnKeyUp = false;
          consumeKeyEvent(event);
          focusAndSelectOpacity();
      }

      function handleOpacityKey(event) {
          var key = event.keyName ? event.keyName.toUpperCase() : "";

          if (!replaceOpacityOnNextType || key === "ENTER" || key === "RETURN") {
              return;
          }

          replaceOpacityOnNextType = false;
          opacityInput.text = "";
      }

      function focusAndSelectOpacity() {
          replaceOpacityOnNextType = true;
          opacityInput.active = true;
          opacityInput.textselection = opacityInput.text;

          try {
              opacityInput.selection = [0, opacityInput.text.length];
          } catch (error) {
          }
      }

      function setBlendMode(mode, focusOpacity) {
          selectedBlendMode = mode;

          opacityInput.enabled = true;
          applyBtn.enabled = true;

          if (focusOpacity) {
              focusAndSelectOpacity();
          }
      }

      function applyTransparencyChanges(args) {
          var mode = args[0];
          var opacity = args[1];

          for (var i = 0; i < app.selection.length; i++) {
              app.selection[i].transparencySettings.blendingSettings.properties = {
                  blendMode: mode,
                  opacity: opacity
              };
          }
      }

      function applyOpacityAndClose() {
          var opacity = Number(opacityInput.text);

          if (isNaN(opacity) || opacity < 0 || opacity > 100) {
              alert("Enter an opacity value from 0 to 100.");
              opacityInput.active = true;
              opacityInput.textselection = opacityInput.text;
              return;
          }

          app.doScript(
              applyTransparencyChanges,
              ScriptLanguage.JAVASCRIPT,
              [selectedBlendMode, opacity],
              UndoModes.FAST_ENTIRE_SCRIPT,
              "Set Blend Mode + Opacity"
          );

          win.close();
      }

      function getCenteredDialogLocationOverInDesign() {
          try {
              win.layout.layout(true);

              var windowInfo = app.doScript(
                  "tell application \"System Events\"\n" +
                  "set indesignProcess to first application process whose bundle identifier is \"com.adobe.InDesign\"\n" +
                  "set bestArea to 0\n" +
                  "set bestInfo to \"\"\n" +
                  "tell indesignProcess\n" +
                  "repeat with candidateWindow in windows\n" +
                  "try\n" +
                  "set isMinimized to value of attribute \"AXMinimized\" of candidateWindow\n" +
                  "if isMinimized is false then\n" +
                  "set windowPosition to position of candidateWindow\n" +
                  "set windowSize to size of candidateWindow\n" +
                  "set windowArea to (item 1 of windowSize) * (item 2 of windowSize)\n" +
                  "if windowArea > bestArea then\n" +
                  "set bestArea to windowArea\n" +
                  "set bestInfo to ((item 1 of windowPosition) as text) & \",\" & ((item 2 of windowPosition) as text) & \",\" & ((item 1 of windowSize) as text) & \",\" & ((item 2 of windowSize) as text)\n" +
                  "end if\n" +
                  "end if\n" +
                  "end try\n" +
                  "end repeat\n" +
                  "end tell\n" +
                  "if bestInfo is \"\" then error \"No visible InDesign window found.\"\n" +
                  "return bestInfo",
                  ScriptLanguage.APPLESCRIPT_LANGUAGE
              );

              if (typeof windowInfo === "string") {
                  windowInfo = windowInfo.split(",");
              }

              var left = Number(windowInfo[0]);
              var top = Number(windowInfo[1]);
              var width = Number(windowInfo[2]);
              var height = Number(windowInfo[3]);
              var dialogWidth = win.preferredSize.width;
              var dialogHeight = win.preferredSize.height;

              if (isNaN(left) || isNaN(top) || isNaN(width) || isNaN(height)) {
                  throw new Error("Could not read InDesign window bounds.");
              }

              return [
                  Math.round(left + ((width - dialogWidth) / 2)),
                  Math.round(top + ((height - dialogHeight) / 2))
              ];
          } catch (error) {
              return null;
          }
      }

      multiplyBtn.onClick = function () {
          setBlendMode(BlendMode.MULTIPLY, true);
      };

      screenBtn.onClick = function () {
          setBlendMode(BlendMode.SCREEN, true);
      };

      applyBtn.onClick = applyOpacityAndClose;

      win.addEventListener("keydown", handleKey);
      multiplyBtn.addEventListener("keydown", handleKey);
      screenBtn.addEventListener("keydown", handleKey);
      opacityInput.addEventListener("keydown", handleOpacityKey);
      opacityInput.addEventListener("keydown", handleKey);
      applyBtn.addEventListener("keydown", handleKey);
      win.addEventListener("keyup", handleKeyUp);
      multiplyBtn.addEventListener("keyup", handleKeyUp);
      screenBtn.addEventListener("keyup", handleKeyUp);
      opacityInput.addEventListener("keyup", handleKeyUp);
      applyBtn.addEventListener("keyup", handleKeyUp);

      var dialogLocation = getCenteredDialogLocationOverInDesign();

      win.onShow = function () {
          if (dialogLocation) {
              win.location = dialogLocation;
          }

          multiplyBtn.active = true;
      };

      win.show();
  })();
