import * as Color from "color";
//import * as fs from "fs-extra";
//import * as os from "os";
//import * as path from 'path';
import { execSync } from "child_process";
import * as vscode from "vscode";
import { ColorThemeKind, ExtensionContext, window, workspace } from "vscode";

function doit() {
  // windowColors.configuration
  const json = workspace
    .getConfiguration("windowColors")
    .get<string>("configuration");
  if (json === undefined || json == "") {
    // No configuration found
    vscode.window.showInformationMessage(
      "No custom git repo color settings defined, please set some up in the setting."
    );
    return;
  }

  let customColors = undefined;
  try {
    customColors = JSON.parse(json);
  } catch (error) {
    const e = error as Error;
    vscode.window.showErrorMessage(
      "Configuration json is invalid: " + e.message
    );
    return;
  }

  console.group(customColors);

  /** retain initial unrelated colorCustomizations*/
  const cc = JSON.parse(
    JSON.stringify(
      workspace.getConfiguration("workbench").get("colorCustomizations")
    )
  );

  // const configFile = path.join(os.homedir(), ".config", "vscode.git.colors.json")
  // if (!fs.existsSync(configFile)) {
  //   // Accept native color behavior
  //   return;
  // }
  // const customColors = fs.readJSONSync(configFile)

  if (workspace.workspaceFolders === undefined) {
    return;
  }

  let workspaceRoot: string = workspace.workspaceFolders[0].uri.fsPath;
  process.chdir(workspaceRoot);

  let repoName = "";
  try {
    repoName = execSync("git config --get remote.origin.url", {
      encoding: "utf-8",
    }).trim();
  } catch (error) {
    console.error("Error:", error);
    return;
  }
  if (repoName === undefined || repoName === "") {
    return;
  }

  let sideBarColor = undefined;

  for (const item of customColors) {
    if (repoName.includes(item["name"])) {
      try {
        sideBarColor = Color(item["color"]);
      } catch (error) {
        sideBarColor = undefined;
        vscode.window.showInformationMessage(
          "Could not parse color: " + item["color"]
        );
      }
    }
  }

  if (sideBarColor === undefined) {
    return;
  }

  let titleBarTextColor: Color = Color("#ffffff");
  let titleBarColor: Color = Color("#ffffff");

  const sideBarColor_dark = getColorWithLuminosity(sideBarColor, 0.02, 0.027);
  const titleBarTextColor_dark = getColorWithLuminosity(
    sideBarColor_dark,
    0.95,
    1
  );
  const titleBarColor_dark = sideBarColor_dark.lighten(0.4);

  const sideBarColor_light = getColorWithLuminosity(sideBarColor, 0.45, 0.55);
  const titleBarTextColor_light = getColorWithLuminosity(
    sideBarColor_light,
    0,
    0.01
  );
  const titleBarColor_light = sideBarColor_light.lighten(0.1);

  const theme: ColorThemeKind = window.activeColorTheme.kind;

  if (theme === ColorThemeKind.Dark) {
    sideBarColor = sideBarColor_dark;
    titleBarTextColor = titleBarTextColor_dark;
    titleBarColor = titleBarColor_dark;
  } else if (theme === ColorThemeKind.Light) {
    sideBarColor = sideBarColor_light;
    titleBarTextColor = titleBarTextColor_light;
    titleBarColor = titleBarColor_light;
  }

  const doRemoveColors = false;

  let doUpdateColors = true;

  // if (
  //   cc &&
  //   (cc["activityBar.background"] ||
  //     cc["titleBar.activeBackground"] ||
  //     cc["titleBar.activeForeground"])
  // ) {
  //   //don't overwrite
  //   doUpdateColors = false;
  // }

  if (doUpdateColors || doRemoveColors) {
    const newColors = {
      "activityBar.background": doRemoveColors ? undefined : sideBarColor.hex(),
      "titleBar.activeBackground": doRemoveColors
        ? undefined
        : titleBarColor.hex(),
      "titleBar.activeForeground": doRemoveColors
        ? undefined
        : titleBarTextColor.hex(),
    };
    workspace
      .getConfiguration("workbench")
      .update("colorCustomizations", { ...cc, ...newColors }, false);
  }
}

export function activate(context: ExtensionContext) {
  if (!workspace.workspaceFolders) {
    return;
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration("windowColors.configuration")) {
        doit();
      }
    })
  );

  doit();
}

const getColorWithLuminosity = (
  color: Color,
  min: number,
  max: number
): Color => {
  let c: Color = Color(color.hex());

  while (c.luminosity() > max) {
    c = c.darken(0.01);
  }
  while (c.luminosity() < min) {
    c = c.lighten(0.01);
  }
  return c;
};
