import fs from "fs/promises";

export const RegExps = {
  DiscordWebhook: /(?<url>^https:\/\/(?:(?:canary|ptb).)?discord(?:app)?.com\/api(?:\/v\d+)?\/webhooks\/(?<id>\d+)\/(?<token>[\w-]+)\/?$)/
}

export const breakInline = { name: "\u200B", value: "\u200B", inline: true };

export function getLargestInArray(array) {
  let largest = array[0] || 0;

  for (var i = 0; i < array.length; i++) {
    if (array[i] > largest ) {
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
