import chalk from "chalk";

/**
 * ASCII art banner (the MimikkAi "888" figure) printed before the init wizard.
 * Kept as a raw array of lines: literal source art keeps spacing exact.
 */

/** MimikkAi ASCII logo, printed verbatim at wizard start. */
const LOGO = [
  "888b     d888 d8b               d8b 888      888             d8888 d8b",
  "8888b   d8888 Y8P               Y8P 888      888            d88888 Y8P",
  "88888b.d88888                       888      888           d88P888    ",
  "888Y88888P888 888 88888b.d88b.  888 888  888 888  888     d88P 888 888",
  "888 Y888P 888 888 888 \"888 \"88b 888 888 .88P 888 .88P    d88P  888 888",
  "888  Y8P  888 888 888  888  888 888 888888K  888888K    d88P   888 888",
  "888   \"   888 888 888  888  888 888 888 \"88b 888 \"88b  d8888888888 888",
  "888       888 888 888  888  888 888 888  888 888  888 d88P     888 888",
  "                                                                      ",
].join("\n");

/** Print the ASCII logo in the terminal accent color. */
export function printLogo(): void {
  console.log(chalk.cyan(LOGO));
}