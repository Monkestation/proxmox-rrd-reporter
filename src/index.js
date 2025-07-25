import proxmoxApi from "proxmox-api";
import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { WebhookClient, EmbedBuilder, AttachmentBuilder } from "discord.js";
import {
  breakInline,
  createDir,
  getLargestInArray,
  prettyBytesWrapper as prettyBytes,
  RegExps,
} from "./util.js";

dotenv.config();

// 5 minutes
const scriptTimeout = 5 * 60 * 1000;

const config = {
  proxmoxVmid: process.env.PROXMOX_VMID || "100",
  proxmoxNode: process.env.PROXMOX_NODE,
  period: process.env.PERIOD || "hour",
  proxmoxHost: process.env.PROXMOX_HOST,
  proxmoxPort: process.env.PROXMOX_PORT,
  proxmoxUsername: process.env.PROXMOX_USERNAME,
  proxmoxPassword: process.env.PROXMOX_PASSWORD,
  discordWebhook: process.env.DISCORD_WEBHOOK,
  discordWebhookThreadID: process.env.DISCORD_WEBHOOK_THREADID,
  period: process.env.PERIOD,
  saveRRDData: Boolean(process.env.SAVE_RRDDATA),
};

const periodColorMap = {
  hour: 0x3b88c3,
  day: 0x48f08b,
  week: 0x7cd228,
  month: 0xfbc02d,
  year: 0xe53935,
};

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

async function preFlight() {
  if (!process.env.PERIOD) {
    console.log("No period specified, defaulting to hour");
  }
  const optional = ["discordWebhook", "discordWebhookThreadID", "proxmoxPort"];
  for (const [key, value] of Object.entries(config)) {
    if (value == undefined && !optional.includes(key)) {
      throw new Error(`Missing config value for ${key}`);
    }

    if (value === "") config[key] = undefined;
  }

  if (
    config.discordWebhook &&
    !RegExps.DiscordWebhook.test(config.discordWebhook)
  )
    throw new Error(
      `Regular expression failed for Discord Webhook (Make sure you're copying it right)`
    );

  console.log(
    "Running with params:\n" +
      `- PX Host: ${config.proxmoxHost}:${config.proxmoxPort}\n` +
      `- PX User: ${config.proxmoxUsername}\n` +
      `- PX Node: ${config.proxmoxNode}\n` +
      `- PX Vmid: ${config.proxmoxVmid}\n` +
      `- Monitor Period: ${config.period}\n`
  );
}

async function main() {
  setTimeout(() => {
    console.error(
      `Script ran for longer than set timeout (${scriptTimeout}), killing...`
    );
    process.exit(1);
  }, scriptTimeout);
  const proxmox = proxmoxApi({
    host: config.proxmoxHost,
    port: config.proxmoxPort,
    password: config.proxmoxPassword,
    username: config.proxmoxUsername,
    strictSSL: false,
    authTimeout: 300000,
    queryTimeout: 300000,
  });

  const rrdGraph = await proxmox.nodes
    .$(config.proxmoxNode)
    .qemu.$(config.proxmoxVmid)
    .rrd.$get({
      timeframe: config.period,
      cf: "MAX",
      ds: "netout,netin",
    });

  const rrdData = (
    await proxmox.nodes
      .$(config.proxmoxNode)
      .qemu.$(config.proxmoxVmid)
      .rrddata.$get({
        timeframe: config.period,
        cf: "MAX",
      })
  ).map((e) => {
    e.netin = e.netin == undefined ? 0 : e.netin;
    e.netout = e.netout == undefined ? 0 : e.netout;
    return e;
  });

  if (config.saveRRDData) {
    try {
      await createDir("rdddata");
      const now = Math.floor(Date.now() / 1000);
      const baseName = `rdddata_${config.proxmoxNode}_${config.proxmoxVmid}_${config.period}_${now}`;
      await fs.writeFile(
        path.join(process.cwd(), "rdddata", `${baseName}.json`),
        JSON.stringify(
          {
            host: config.proxmoxHost,
            port: config.proxmoxPort,
            node: config.nodeName,
            vmid: config.vmid,
            data: rrdData,
          },
          null,
          "  "
        )
      );
      await fs.writeFile(
        path.join(process.cwd(), "rdddata", `${baseName}.png`),
        Buffer.from(rrdGraph.image, "binary")
      );
    } catch (error) {
      console.error("Failed to save RRD Data", error);
    }
  }

  const netinOnly = rrdData.map((e) => e.netin);
  const netoutOnly = rrdData.map((e) => e.netout);
  const sendingData = {
    lastNetIn: prettyBytes(
      rrdData[rrdData.findLastIndex((e) => e.netin)].netin
    ),
    lastNetOut: prettyBytes(
      rrdData[rrdData.findLastIndex((e) => e.netout)].netout
    ),
    highestNetInPeriod: prettyBytes(getLargestInArray(netinOnly)),
    highestNetOutPeriod: prettyBytes(getLargestInArray(netoutOnly)),
  };

  console.log(`Data this period ${config.period}:\n`, sendingData);

  if (!config.discordWebhook) return;
  const webhookData = RegExps.DiscordWebhook.exec(config.discordWebhook);

  const webhook = new WebhookClient({
    id: webhookData.groups["id"],
    token: webhookData.groups["token"],
    url: webhookData.groups["url"],
  });

  await webhook.send({
    threadId: config.discordWebhookThreadID,
    embeds: [
      new EmbedBuilder()
        .setTitle(
          `:information: (${config.period}) Network Monitor Statistics - ${config.proxmoxVmid} `
        )
        .setDescription(`Current network statistics for this period`)
        .setFields([
          {
            name: "Last `netin`",
            value: sendingData.lastNetIn,
            inline: true,
          },
          {
            name: "Last `netout`",
            value: sendingData.lastNetOut,
            inline: true,
          },
          breakInline,
          {
            name: "Highest `netin` this period",
            value: sendingData.highestNetInPeriod,
            inline: true,
          },
          {
            name: "Highest `netout` this period",
            value: sendingData.highestNetOutPeriod,
            inline: true,
          },
        ])
        .setImage(`attachment://${path.basename(rrdGraph.filename)}`)
        .setColor(periodColorMap[config.period] || 0x000000)
        .setTimestamp(new Date())
        .setAuthor({
          name: "proxmox-rrd-reporter",
          url: "https://github.com/monkestation/proxmox-rrd-reporter",
        }),
    ],
    files: [
      new AttachmentBuilder(Buffer.from(rrdGraph.image, "binary"), {
        name: path.basename(rrdGraph.filename),
        description: "Proxmox Network Graph via RRDtool",
      }),
    ],
  });
}

preFlight()
  .then(main)
  .then(process.exit)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
