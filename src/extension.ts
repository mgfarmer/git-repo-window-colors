import * as Color from "color";
//import * as fs from "fs-extra";
//import * as os from "os";
//import * as path from 'path';
import { execSync } from "child_process";
import * as vscode from "vscode";
import { ColorThemeKind, ExtensionContext, window, workspace } from "vscode";

let currentBranch: undefined | string = undefined;

function doit() {
  stopBranchPoll();
  // windowColors.configuration
  const obj = workspace
    .getConfiguration("windowColors")
    .get<object>("repoConfigurationList");

  const doColorInactiveTitlebar = workspace
    .getConfiguration("windowColors")
    .get<boolean>("colorInactiveTitlebar");

  const doColorActiveTitlebar = workspace
    .getConfiguration("windowColors")
    .get<boolean>("colorActiveTitlebar");

  const invertBranchColorLogic = workspace
    .getConfiguration("windowColors")
    .get<boolean>("invertBranchColorLogic");

  if (obj === undefined || Object.keys(obj).length === 0) {
    return;
  }

  let hueRotation = workspace
    .getConfiguration("windowColors")
    .get<number>("automaticBranchIndicatorColorKnob");
  if (hueRotation === undefined) {
    hueRotation = 60;
  }

  let activityBarColorKnob = workspace
    .getConfiguration("windowColors")
    .get<number>("activityBarColorKnob");
  if (activityBarColorKnob === undefined) {
    activityBarColorKnob = 3;
  }
  activityBarColorKnob = activityBarColorKnob / 10;

  let json = JSON.parse(JSON.stringify(obj));

  for (const key in json) {
    const val = json[key] as string;
    console.log(val.replaceAll(" ", ""));
  }

  // if (json === undefined || json == "") {
  //   // No configuration found
  //   vscode.window.showInformationMessage(
  //     "No custom git repo color settings defined, please set some up in the setting."
  //   );
  //   return;
  // }

  /** retain initial unrelated colorCustomizations*/
  const cc = JSON.parse(
    JSON.stringify(
      workspace.getConfiguration("workbench").get("colorCustomizations")
    )
  );

  if (workspace.workspaceFolders === undefined) {
    return;
  }

  let workspaceRoot: string = workspace.workspaceFolders[0].uri.fsPath;

  let repoName = "";
  try {
    repoName = execSync("git config --get remote.origin.url", {
      encoding: "utf-8",
      cwd: workspaceRoot,
    }).trim();
  } catch (error) {
    console.error("Error:", error);
    return;
  }
  if (repoName === undefined || repoName === "") {
    return;
  }

  let repoColor = undefined;
  let branchColor = undefined;
  let defBranch = undefined;

  for (const item in json) {
    defBranch = undefined;
    const parts = json[item].split(":");
    if (parts.length !== 2) {
      // Invalid entry
      continue;
    }
    const repoParts = parts[0].split("/");
    const repo = repoParts[0].trim();
    if (repoParts.length > 1) {
      defBranch = repoParts[1].trim();
    }

    const colorParts = parts[1].split("/");
    const rColor = colorParts[0].trim();
    let bColor = undefined;
    if (colorParts.length > 1) {
      bColor = colorParts[1].trim();
    }

    if (repoName.includes(repo)) {
      try {
        repoColor = Color(rColor);
      } catch (error) {
        repoColor = undefined;
        vscode.window.showInformationMessage(
          "Could not parse repo color: " + rColor
        );
      }
      if (defBranch !== undefined) {
        try {
          if (bColor !== undefined) {
            branchColor = Color(bColor);
            startBranchPoll();
          }
        } catch (error) {
          branchColor = undefined;
          vscode.window.showInformationMessage(
            "Could not parse branch color: " + bColor
          );
        }
      }

      break;
    }
  }

  if (repoColor === undefined) {
    return;
  }

  if (defBranch !== undefined) {
    if (
      (!invertBranchColorLogic && currentBranch != defBranch) ||
      (invertBranchColorLogic && currentBranch === defBranch)
    ) {
      // Not on the default branch
      if (branchColor === undefined) {
        // No color specified, use modified repo color
        branchColor = repoColor.rotate(hueRotation);
      }
    } else {
      // On the default branch
      branchColor = repoColor;
    }
  } else {
    branchColor = repoColor;
  }

  let titleBarTextColor: Color = Color("#ffffff");
  let titleBarColor: Color = Color("#ffffff");
  let titleInactiveBarColor: Color = Color("#ffffff");
  //let titleBarBorderColor: Color = Color("red");
  let sideBarColor: Color = Color("#ffffff");

  const theme: ColorThemeKind = window.activeColorTheme.kind;

  if (theme === ColorThemeKind.Dark) {
    sideBarColor = doColorActiveTitlebar
      ? branchColor.lighten(activityBarColorKnob)
      : repoColor;
    // sideBarColor = doColorActiveTitlebar
    //   ? getColorWithLuminosity(
    //       branchColor,
    //       activityBarColorKnob,
    //       activityBarColorKnob + 0.01
    //     )
    //   : repoColor;
    titleBarTextColor = getColorWithLuminosity(repoColor, 0.95, 1);
    titleBarColor = repoColor;
    titleInactiveBarColor = titleBarColor.darken(0.25);
  } else if (theme === ColorThemeKind.Light) {
    sideBarColor = doColorActiveTitlebar
      ? branchColor.darken(activityBarColorKnob)
      : repoColor;
    // sideBarColor = doColorActiveTitlebar
    //   ? getColorWithLuminosity(
    //       branchColor,
    //       activityBarColorKnob,
    //       activityBarColorKnob + 0.01
    //     )
    //   : repoColor;
    if (repoColor.isDark()) {
      titleBarTextColor = getColorWithLuminosity(repoColor, 0.95, 1);
    } else {
      titleBarTextColor = getColorWithLuminosity(repoColor, 0, 0.01);
    }
    titleBarColor = repoColor;
    titleInactiveBarColor = titleBarColor.lighten(0.15);
  }

  const newColors = {
    //"titleBar.border": titleBarBorderColor.hex(),
    "activityBar.background": sideBarColor.hex(),
    "activityBar.foreground": titleBarTextColor.hex(),
    "titleBar.activeBackground": doColorActiveTitlebar
      ? titleBarColor.hex()
      : undefined,
    "titleBar.activeForeground": doColorActiveTitlebar
      ? titleBarTextColor.hex()
      : undefined,
    "titleBar.inactiveBackground": doColorInactiveTitlebar
      ? titleInactiveBarColor.hex()
      : undefined,
    "titleBar.inactiveForeground": doColorInactiveTitlebar
      ? titleBarTextColor.hex()
      : undefined,
  };
  workspace
    .getConfiguration("workbench")
    .update("colorCustomizations", { ...cc, ...newColors }, false);
}

function getCurrentBranch(): string {
  try {
    if (workspace.workspaceFolders === undefined) {
      return "";
    }
    let workspaceRoot: string = workspace.workspaceFolders[0].uri.fsPath;
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf-8",
      cwd: workspaceRoot,
    }).trim();
    return branch;
  } catch (error) {
    console.error("Error:", error);
    return "";
  }
}

let intervalId: NodeJS.Timeout | undefined = undefined;

function stopBranchPoll() {
  clearInterval(intervalId);
}

function startBranchPoll() {
  intervalId = setInterval(function () {
    let branch = "";
    try {
      if (workspace.workspaceFolders === undefined) {
        return;
      }
      branch = getCurrentBranch();
      if (currentBranch != branch) {
        currentBranch = branch;
        console.log("change to branch: " + branch);
        doit();
      }
    } catch (error) {
      console.error("Error:", error);
      return;
    }
  }, 2000);
}

export function activate(context: ExtensionContext) {
  if (!workspace.workspaceFolders) {
    return;
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (
        e.affectsConfiguration("windowColors") ||
        // e.affectsConfiguration("windowColors.colorInactiveTitlebar") ||
        // e.affectsConfiguration("windowColors.colorActiveTitlebar") ||
        // e.affectsConfiguration("windowColors.activityBarColorKnob") ||
        // e.affectsConfiguration("windowColors.invertBranchColorLogic") ||
        // e.affectsConfiguration("windowColors.automaticBranchIndicatorColorKnob") ||
        e.affectsConfiguration("workbench.colorTheme")
        //
      ) {
        doit();
      }
    })
  );

  currentBranch = getCurrentBranch();

  const style = workspace
    .getConfiguration("window")
    .get("titleBarStyle") as string;
  let message = "";
  let restart = false;
  if (style !== "custom") {
    message += "window.titleBarStyle='custom'";
    restart = true;
  }

  const visibility = workspace
    .getConfiguration("window")
    .get("customTitleBarVisibility") as string;
  if (visibility !== "auto") {
    if (message !== "") {
      message += " and ";
    }
    message += "window.customTitleBarVisibility='auto'";
  }

  if (message !== "") {
    message = "This plugin works best with " + message;
    if (restart) {
      message += " Changing titleBarStyle requires vscode to be restarted.";
    }
    vscode.window.showInformationMessage(message);
    // workspace
    //   .getConfiguration("window")
    //   .update("customTitleBarVisibility", "auto", true);
    // workspace
    //   .getConfiguration("window")
    //   .update("titleBarStyle", "custom", true);
  }

  setInterval(function () {
    let branch = "";
    try {
      if (workspace.workspaceFolders === undefined) {
        return;
      }
      branch = getCurrentBranch();
      if (currentBranch != branch) {
        currentBranch = branch;
        console.log("change to branch: " + branch);
        doit();
      }
    } catch (error) {
      console.error("Error:", error);
      return;
    }
  }, 2000);

  // const gitExtension = extensions.getExtension("vscode.git")!.exports;
  // //const gitBaseExtension = extensions.getExtension("vscode.git-base")!.exports;

  // const git = gitExtension.getAPI(1);
  // //const gitbase = gitBaseExtension.getAPI(1);

  // git.onDidChangeState(() => {
  //   console.log("repo state change!");
  //   if (git.repositories.length > 0) {
  //     try {
  //       const repo = git.repositories[0];
  //       console.log(repo);
  //       repo.state.onDidChange(() => {
  //         console.log("repo!");
  //       });
  //     } catch (error) {
  //       console.log(error);
  //     }
  //   }
  // });

  doit();
}

const getColorWithLuminosity = (
  color: Color,
  min: number,
  max: number
): Color => {
  let c: Color = Color(color.hex());
  let iter = 0;
  while (c.luminosity() > max && iter < 10000) {
    c = c.darken(0.01);
    iter++;
  }
  console.log(iter);
  iter = 0;
  while (c.luminosity() < min && iter < 10000) {
    c = c.lighten(0.01);
    iter++;
  }
  console.log(iter);
  return c;
};
