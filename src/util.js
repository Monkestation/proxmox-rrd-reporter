import fs from "fs/promises";
import prettyBytes from "pretty-bytes";

export const RegExps = {
  DiscordWebhook:
    /(?<url>^https:\/\/(?:(?:canary|ptb).)?discord(?:app)?.com\/api(?:\/v\d+)?\/webhooks\/(?<id>\d+)\/(?<token>[\w-]+)\/?$)/,
};

export const breakInline = { name: "\u200B", value: "\u200B", inline: true };

export function getLargestInArray(array) {
  let largest = array[0] || 0;

  for (var i = 0; i < array.length; i++) {
    if (array[i] > largest) {
      largest = array[i];
    }
  }
  return largest;
}

export async function createDir(dir) {
  try {
    await fs.stat(dir);
  } catch (error) {
    if (error.code === "ENOENT") {
      await fs.mkdir(dir, { recursive: true });
    } else {
      throw error;
    }
  }
}

/**
 * Convert bytes to a human readable string: `1337` → `1.34 kB`.
 * @param {number | bigint} input The number to format.
 * @param {import("pretty-bytes").Options} options
 */
export function prettyBytesWrapper(input, options) {
  const pbsSplit = prettyBytes(input, {
    space: true,
  }).split(" ");

  pbsSplit[1] =
    pbsSplit[1].charAt(0).toUpperCase() +
    pbsSplit[1].toLowerCase().slice(1) +
    "ps";

  return pbsSplit.join(" ");
}
