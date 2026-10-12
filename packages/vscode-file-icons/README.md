<div align="center">
  <br />
  <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/packages/vscode-file-icons/media/icon.png" width="72" />

  <h1>Courier File Icons</h1>

  <p><strong>Courier's own icons in your icon theme.</strong></p>

  <p>Courier's icons for <code>courier.config.ts</code>, <code>courier.mocks.ts</code> and the <code>.courier</code> folder in Material Icon Theme and vscode-icons, the folder drawn in each theme's own style. You agree once; from then on they follow you into the other theme, onto your other machines, into remote windows and through updates.</p>

  <p>
    <a href="https://code.visualstudio.com/"><img alt="VS Code 1.95 or later" src="https://img.shields.io/badge/vs%20code-1.95%2B-1c63d6?style=flat-square&labelColor=08090a" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud/docs/studio/editor#courier-file-icons"><strong>Documentation</strong></a>
    &nbsp;·&nbsp;
    <a href="https://marketplace.visualstudio.com/items?itemName=noverax.courier-vscode">Courier for VS Code</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/vscode-file-icons">Source</a>
  </p>

  <br />

  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/images/vscode/icons-dark.png" />
    <img alt="The Explorer in vscode-icons: the .courier folder with Courier's folder icon, courier.config.ts with Courier's mark in blue and courier.mocks.ts with it in violet" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/images/vscode/icons-light.png" width="295" />
  </picture>
  <br />
</div>

<br />

## Overview

Material Icon Theme and vscode-icons take custom icons through their own settings, and Courier brings its own for `courier.config.*`, `courier.mocks.*` and the `.courier` folder. The folder is drawn in each theme's own style: flat, as Material Icon Theme draws its folders; with Courier's mark on a disc at the corner, as vscode-icons draws its own, and with a look of its own for light colour themes.

[Courier for VS Code](https://marketplace.visualstudio.com/items?itemName=noverax.courier-vscode) installs this extension with it. It runs where the editor's window runs, beside the icon themes — on this computer in a remote window too, while Courier itself runs where your code is.

## Agree once

With either theme in use in a Courier project — as the editor starts, when a Courier project turns up in the workspace, or when you pick the theme later — the extension offers to put the icons in, and one click shows them, no reload needed. **Courier: Show Courier's Icons in the File Icon Theme** does it any time, and **Courier: Remove Courier's Icons from the File Icon Theme** takes them out again.

## Then they follow you

| When | What happens |
| --- | --- |
| You pick the other theme | The icons go into it, in its own style, without asking again |
| You install the other theme later | The same, once it runs |
| You open another machine Settings Sync brings your settings to | The icons are put in place there on their own, without asking again |
| You open a remote window — SSH, WSL, a container, a codespace | They show as they do locally: the extension runs on this computer, beside the theme |
| You use several profiles | A profile that asked for the icons shows them; one that never did leaves the others' copies alone |
| An update comes | Nothing changes: the settings name no version |
| You take them out, on any machine | They go on every machine Settings Sync reaches, and their copies there go with the last profile that used them |
| You uninstall the extension | They keep showing; take them out first to leave nothing behind |

## Where the icons live

The icons go in through your user settings — the associations those themes read — beside your own, which stay as they are. The icons themselves sit in a folder of their own beside Material Icon Theme, `.noverax-courier-icons` in the editor's extensions folder — its dot keeps the editor from reading it as an extension — and in vscode-icons' custom icons folder. Every profile shares both folders: an empty file for each profile that put the icons in, named by a digest of an id the profile keeps in its own state, keeps the copies until the last of them takes the icons out — and a profile not started for ninety days, deleted or temporary, no longer keeps them.

Each icon theme builds one theme file, in its own folder, for every profile — from the settings of whichever profile changed them last. A profile that asked for Courier's icons and finds them left out has it built again as it starts: vscode-icons by its own command, Material Icon Theme, which has none, by Courier's folder entry going out and coming back. vscode-icons is built again without them for a profile that never asked; Material Icon Theme may show them there until its settings change in that profile.

A list of vscode-icons associations in a folder's own settings takes the place of yours there, so Courier's icons would not show in it: the extension says so once per folder and, when you agree, adds Courier's icons after the folder's own — in the folder's settings file, which your team may share. A folder you trust whose settings name Courier's icons gets their copies, whoever put them there.

In a workspace you have not trusted, the folder vscode-icons reads custom icons from comes from your own settings alone: the workspace cannot choose where Courier's icons are written. A theme that does not run beside the extension takes no icons from it, and is said so — in a remote window, one installed on the remote machine only; install it on this computer too, and VS Code runs it here.

Other icon themes take no custom icons; VS Code's own Seti among them.

## Commands

- **Courier: Show Courier's Icons in the File Icon Theme**
- **Courier: Remove Courier's Icons from the File Icon Theme**

## Settings

| Setting | What it does |
| --- | --- |
| `courier.fileIcons.offer` | Offer once to put Courier's icons into the icon theme in use (default: on) |

Its log is under **Courier File Icons** in the Output panel.

## Part of Courier

Courier is type-safe HTTP for any framework: define your API once in plain TypeScript and call it from server code, the browser and AI agents, every call visible in Studio. [Courier for VS Code](https://marketplace.visualstudio.com/items?itemName=noverax.courier-vscode) brings Studio into your editor, and this extension marks Courier's files in it. See [courier.noverax.cloud](https://courier.noverax.cloud).

<br />

## License

[MIT](https://github.com/NoveraX/courier/blob/master/LICENSE)

<br />

<div align="center">
  <sub>Part of <a href="https://github.com/NoveraX/courier">Courier</a> · built by <a href="https://github.com/NoveraX">NoveraX</a></sub>
</div>
