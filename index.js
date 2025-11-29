// ========== [ IMPORT ] ==========
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const { NewMessage } = require("telegram/events");
const { v4: uuidv4 } = require('uuid');

// ========== [ CONFIG ] ==========
const config = require("./config.js");

const apiId = 38448008; // angka, ga perlu parseInt lagi
const apiHash = "9f8152de58b2a3a5ef39dbeb927acf3a";
let stringSession = new StringSession(config.STRING_SESSION || "");

const BL_FILE = path.join(__dirname, 'bl.json');

const wait = ms => new Promise(res => setTimeout(res, ms));

function loadBlacklist() {
  try {
    if (!fs.existsSync(BL_FILE)) fs.writeFileSync(BL_FILE, '[]', 'utf8');
    return JSON.parse(fs.readFileSync(BL_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveBlacklist(data) {
  fs.writeFileSync(BL_FILE, JSON.stringify(data, null, 2), 'utf8');
}

const GEMINI_API_KEY = "AIzaSyBzXtQ30evYlw6dRdQyF5qA85QLZJAfMGE";
const GEMINI_MODEL = "gemini-2.0-flash";

// ========== [ SAVE SESSION KE CONFIG ] ==========
function saveSessionToConfig(sessionString) {
    const configPath = path.join(__dirname, "config.js");

    let file = fs.readFileSync(configPath, "utf8");

    const updated = file.replace(
        /STRING_SESSION:\s*".*"/,
        `STRING_SESSION: "${sessionString}"`
    );

    fs.writeFileSync(configPath, updated, "utf8");
    console.log("💾 STRING_SESSION baru berhasil disimpan ke config.js");
}

// ========== [ LOGIN UTAMA ] ==========
async function run() {
    console.clear();
    console.log("🌐 Telegram UBot Loader");
    console.log("==============================\n");

    const SESSION_FILE = path.join(__dirname, "session.txt");

    // Jika ada session.txt → pakai dulu
    if (fs.existsSync(SESSION_FILE)) {
        const fileSession = fs.readFileSync(SESSION_FILE, "utf8").trim();
        if (fileSession.length > 5) {
            console.log("📦 Session ditemukan, mencoba login ulang...\n");
            stringSession = new StringSession(fileSession);
        }
    }

    // Client
    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });

    // Jika belum ada session di config
    const needLogin = !config.STRING_SESSION || config.STRING_SESSION.length < 10;

    if (needLogin) {
        console.log("🔐 Tidak ada STRING_SESSION, login dulu.\n");

        await client.start({
            phoneNumber: async () => {
                console.log("📱 Masukkan nomor Telegram:");
                return await input.text("> ");
            },
            phoneCode: async () => {
                console.log("\n💬 Masukkan kode OTP dari Telegram:");
                return await input.text("> ");
            },
            password: async () => {
                console.log("\n🔑 Masukkan password 2FA (jika ada jika tidak cukup tekan enter di keyboard saja) :");
                return await input.text("> ");
            },
            onError: (err) => console.log("❌ Error:", err),
        });

        const newSession = client.session.save();

        fs.writeFileSync(SESSION_FILE, newSession, "utf8");
        saveSessionToConfig(newSession);

        console.log("\n✅ Login sukses! Session tersimpan.\n");
    } else {
        console.log("🔄 Menggunakan STRING_SESSION dari config.js...\n");
        await client.connect();
    }

    const me = await client.getMe();
    console.log(`👤 Login sebagai: ${me.username || me.firstName}`);
    console.log("📡 Bot siap menerima perintah.\n");

    // Masukkan logic bot utama lo disini
    await main(client, me);
}

// ========== [ EXPORT ] ==========
module.exports = { run };


let isSelfMode = true;
let afk = {
    isAfk: false,
    reason: "",
    since: null
};

async function CatBox(filePath) {
    const data = new FormData();
    data.append('reqtype', 'fileupload');
    data.append('userhash', ''); 
    data.append('fileToUpload', fs.createReadStream(filePath));

    const config = {
        method: 'POST',
        url: 'https://catbox.moe/user/api.php',
        headers: data.getHeaders(),
        data: data
    };

    try {
        const api = await axios.request(config);
        if (api.data && typeof api.data === 'string' && api.data.startsWith('https://')) {
            return api.data;
        } else {
            throw new Error('Failed to upload to CatBox: Unexpected API response.');
        }
    } catch (error) {
        if (error.response) throw new Error(`CatBox upload failed: ${error.response.status} - ${error.response.data || 'Server error'}`);
        if (error.request) throw new Error('CatBox upload failed: No response from server.');
        throw new Error(`CatBox upload failed: ${error.message}`);
    }
}

function getFileExtension(mime, fileName = "") {
    if (mime) {
        if (mime.includes('image/jpeg') || mime.includes('image/jpg')) return '.jpg';
        if (mime.includes('image/png')) return '.png';
        if (mime.includes('image/gif')) return '.gif';
        if (mime.includes('video/mp4') || mime.includes('video/quicktime')) return '.mp4';
        if (mime.includes('audio/mpeg')) return '.mp3';
        if (mime.includes('audio/ogg')) return '.ogg';
        if (mime.includes('image/webp')) return '.webp';
    }
    if (fileName) {
        const ext = fileName.split('.').pop();
        return ext ? '.' + ext : '.bin';
    }
    return '.bin';
}

async function connectClient() {
    console.log("Loading...");

    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });

    try {
        await client.start({
            phoneNumber: async () => await input.text("Enter Nomor: "),
            password: async () => await input.text("Enter Password:"),
            phoneCode: async () => await input.text("Enter Code: "), 
            onError: (err) => console.error("Error:", err),
        });

        console.log("Koneksi Succses!");
        const newSessionString = client.session.save();
        console.log("Sesi Anda:", newSessionString);
        
        saveSessionToConfig(newSessionString);

    } catch (e) {
        console.error("Error:", e.message);
        return null;
    }

    return client;
}

async function main(client, selfUser) {
    if (!client) {
        console.log("No client provided.");
        return;
    }

    const prefix = ".";

    client.addEventHandler(async (event) => {
       const msg = event.message;
      if (!msg || !msg.out || !msg.message) return;
        const message = event.message;
        
        if (!message || !message.message) return;
        
        const chatId = message.chatId;
        const sender = await message.getSender();
        const isSelf = sender.id.equals(selfUser.id);
        const blacklist = loadBlacklist();
        
        const textMessage = message.message.trim();
        if (!isSelf && message.mentioned && afk.isAfk) {
            const timeSince = ((Date.now() - afk.since) / (1000 * 60)).toFixed(1);
            await client.sendMessage(chatId, {
                message: `<b>AFK!</b>
<i>This user is currently AFK.</i>
Reason: ${afk.reason || 'No Reason'}
Time: ${timeSince} minutes ago.`,
                replyTo: message.id,
                parseMode: 'HTML'
            });
        }
        
        if (!textMessage.startsWith(prefix)) return;

        const args = textMessage.slice(prefix.length).trim().split(/\s+/);
        const cmd = args.shift().toLowerCase();
        const text = args.join(" ");

        if (isSelfMode && !isSelf) {
            return;
        }

        switch (cmd) {
            case 'menu':
                const menuText = `
<blockquote>
┏❐ ⌜ <b>user bot killertzy</b> ⌟ ❐
┃⭔ Creator  : @KillerTzy2
┃⭔ Status   : <b>Online</b>
┃⭔ Mode     : <i>${isSelfMode ? 'Self' : 'Public'}</i>
┃⭔ Prefix   : <code>${prefix}</code>
┃⭔ Modules  : 15
┗❐

╭─❰ <b>A C C O U N T S</b> ❱
│ • <code>.setpp</code>   | Change Profile Photo
│ • <code>.setname</code> | Change Name
│ • <code>.setdesk</code> | Change Bio/Desc
│ • <code>.info</code>    | Account/User Info
╰───────────────
╭─❰ <b>U T I L I T I E S</b> ❱
│ • <code>.block</code>   | Block a user
│ • <code>.tourl</code>   | Upload media & get URL
│ • <code>.cfdall</code>| Send message to all group members
│ • <code>.cfdgroup</code>| Send message to only group
│ • <code>.spam</code> | Send Spam message
╰───────────────
╭─❰ <b>M O D E & S T A T U S</b> ❱
│ • <code>.self</code>    | Switch to Self Mode
│ • <code>.public</code>  | Switch to Public Mode
│ • <code>.afk</code>     | Set AFK status
│ • <code>.unafk</code>   | Return from AFK
╰───────────────
╭─❰ <b>F U N & S E A R C H</b> ❱
│ • <code>.xnxx</code>    | Search Xnxx Videos
│ • <code>.brat</code>    | Generate Brat Text Image
│ • <code>.parsenik</code>    | Generate Data For Nik
│ • <code>.pinterest</code>    | Generate Image For Pinterest
│ • <code>.play</code>    | Play sound
│ • <code>.ai</code>    | Tanya Ke AI
│ • <code>.tt</code>    | Download For Tiktok
│ • <code>.nulis</code>    | Generate Text To Book
╰───────────────
</blockquote>
                `;
                await client.sendMessage(chatId, { message: menuText, parseMode: 'html' });
                break;
                
            case 'addbl': {
    if (!blacklist.includes(chatId)) {
        blacklist.push(chatId);
        saveBlacklist(blacklist);
        await client.sendMessage(chatId, { message: '✅ Chat ini berhasil ditambahkan ke blacklist.' });
    } else {
        await client.sendMessage(chatId, { message: '⚠️ Chat ini sudah ada di blacklist.' });
    }
}
break;

            case 'setpp':
                if (!message.replyTo) {
                    return client.sendMessage(chatId, { message: `Usage: <b>${prefix}setpp</b> <reply media>`, parseMode: 'html' });
                }
                
                try {
                    const repliedMsg = await client.getMessages(chatId, { ids: message.replyTo.replyToMsgId });
                    const media = repliedMsg[0]?.media;
                    if (!media) {
                        return client.sendMessage(chatId, { message: "Media not found in replies." });
                    }
                    
                    await client.sendMessage(chatId, { message: "Processing..." });
                    const downloadedFile = await client.downloadMedia(media);
                    await client.invoke(
                        new Api.photos.UploadProfilePhoto({
                            file: downloadedFile
                        })
                    );
                    
                    await client.sendMessage(chatId, { message: "<b>Profile photo changed successfully!</b>", parseMode: 'html' });

                } catch (e) {
                    console.error("Error setpp:", e);
                    await client.sendMessage(chatId, { message: `Failed to change profile photo. Error: ${e.message.slice(0, 50)}...` });
                }
                break;
                
            case 'setname':
                if (!text) {
                    return client.sendMessage(chatId, { message: `Usage: ${prefix}setname <name>` });
                }
                try {
                    const nameParts = text.split(" ");
                    const firstName = nameParts.shift();
                    const lastName = nameParts.join(" ") || ""; 
                    
                    await client.invoke(
                        new Api.account.UpdateProfile({
                            firstName: firstName,
                            lastName: lastName
                        })
                    );
                    await client.sendMessage(chatId, { message: `Name successfully changed to: <b>${text}</b>`, parseMode: 'html' });
                } catch (e) {
                    console.error("Error setname:", e);
                    await client.sendMessage(chatId, { message: `Failed to change name. Error: ${e.message.slice(0, 50)}...` });
                }
                break;
                
            case 'setdesk':
                if (!text) {
                    return client.sendMessage(chatId, { message: `Usage: ${prefix}setdesk <new description>` });
                }
                try {
                    await client.invoke(
                        new Api.account.UpdateProfile({
                            about: text
                        })
                    );
                    await client.sendMessage(chatId, { message: `Description successfully changed to: <b>${text}</b>`, parseMode: 'html' });
                } catch (e) {
                    console.error("Error setdesk:", e);
                    await client.sendMessage(chatId, { message: `Failed to change description. Error: ${e.message.slice(0, 50)}...` });
                }
                break;

            case 'block':
                if (!text) {
                    return client.sendMessage(chatId, { message: `Usage: ${prefix}block <username> or <ID>` });
                }
                
                try {
                    await client.sendMessage(chatId, { message: `Attempting to block user <b>${text}</b>`, parseMode: 'html' });
                    const targetUser = await client.getEntity(text);
                    
                    await client.invoke(
                        new Api.contacts.Block({
                            id: targetUser
                        })
                    );
                    await client.sendMessage(chatId, { message: `User <b>${text}</b> successfully blocked.`, parseMode: 'html' });
                } catch (e) {
                    console.error("Error block:", e);
                    await client.sendMessage(chatId, { message: `Failed to block user. Error: ${e.message.slice(0, 50)}...` });
                }
                break;

    // ============ .nulis ============
    case 'nulis': {
        const argText = args.join(' ');
        if (!argText)
            return client.sendMessage(chatId, {
                message: '❌ Format salah!\nContoh: `.nulis pagi,Senin,Setya,Kelas 12,Ini contoh teks`'
            });

        const [waktu, hari, nama, kelas, ...isi] = argText.split(',');
        const textTulisan = isi.join(',').trim();

        if (!waktu || !hari || !nama || !kelas || !textTulisan)
            return client.sendMessage(chatId, {
                message: '⚠️ Format tidak lengkap!\nGunakan: `.nulis waktu,hari,nama,kelas,teks`'
            });

        const loading = await client.sendMessage(chatId, {
            message: '🖊️ Membuat tulisan tangan...',
        });

        try {
            const url =
                `https://brat.siputzx.my.id/nulis?waktu=${encodeURIComponent(waktu)}&hari=${encodeURIComponent(hari)}&nama=${encodeURIComponent(nama)}&kelas=${encodeURIComponent(kelas)}&text=${encodeURIComponent(textTulisan)}&type=1`;

            const res = await axios.get(url, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(res.data);

            await client.sendFile(chatId, {
                file: buffer,
                caption: `✎ Tulisan berhasil dibuat oleh *${nama}* — *${kelas}*`,
                parseMode: 'markdown',
                forceDocument: false
            });

            if (loading?.id) client.deleteMessages(chatId, [loading.id]);

        } catch (err) {
            await client.sendMessage(chatId, { message: '❌ Gagal membuat tulisan tangan.' });
        }
    }
        break;


    // ============ .pinterest ============
    case 'pinterest': {
        const query = args.join(' ');
        const type = "image";

        if (!query)
            return client.sendMessage(chatId, { message: '❌ Contoh: `.pinterest aesthetic girl`' });

        const loading = await client.sendMessage(chatId, {
            message: `🔍 Mencari *${query}* di Pinterest...`,
            parseMode: 'markdown'
        });

        try {
            const res = await axios.get(`https://api.siputzx.my.id/api/s/pinterest?query=${encodeURIComponent(query)}&type=${type}`);
            const data = res.data.data?.slice(0, 5) || [];

            if (!data.length) {
                await client.editMessage(loading, { message: '❌ Tidak ada hasil ditemukan.' });
                return;
            }

            let current = 0;
            for (const item of data) {
                current++;

                const caption = `
📌 Pinterest ${type}
🔗 [Buka di Pinterest](${item.pin})
`.trim();

                try {
                    if (item.image_url) {
                        await client.sendFile(chatId, {
                            file: item.image_url,
                            caption,
                            parseMode: 'markdown'
                        });
                    } else if (item.video_url) {
                        await client.sendFile(chatId, {
                            file: item.video_url,
                            caption,
                            parseMode: 'markdown'
                        });
                    } else {
                        await client.sendMessage(chatId, { message: `📌 ${item.pin}` });
                    }
                } catch { }
            }

            // Hapus loading
            if (loading?.id) await client.deleteMessages(chatId, [loading.id]);

            await client.sendMessage(chatId, {
                message: `✅ Selesai menampilkan hasil Pinterest *${query}*!`,
                parseMode: 'markdown'
            });

        } catch (e) {
            await client.sendMessage(chatId, { message: `⚠️ Error: ${e.message}` });
        }
    }
        break;


    // ============ .ai ============
    case 'ai': {
        const prompt = args.join(' ');
        if (!prompt)
            return client.sendMessage(chatId, { message: '❌ Contoh: `.ai siapa presiden indonesia sekarang`' });

        await client.sendMessage(chatId, { message: '💭 Sedang berpikir...' });

        let reply = '';

        try {
            // Gemini
            try {
                const geminiRes = await axios.post(
                    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
                    { contents: [{ role: 'user', parts: [{ text: prompt }] }] }
                );
                reply = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            } catch { }

            // Fallback GPT3
            if (!reply) {
                const fallback = await axios.get(
                    `https://api.siputzx.my.id/api/ai/gpt3?content=${encodeURIComponent(prompt)}`
                );
                reply = fallback.data.result || fallback.data.output || '';
            }

            if (!reply) reply = '⚠️ AI tidak dapat menjawab.';

            await client.sendMessage(chatId, { message: `🤖 Jawaban AI:\n\n${reply}` });

        } catch (err) {
            await client.sendMessage(chatId, { message: `❌ Error AI: ${err.message}` });
        }
    }
        break;


    // ============ .play ============
    case 'play': {
        const query = args.join(' ');
        if (!query)
            return client.sendMessage(chatId, { message: '❌ Contoh: `.play serana`' });

        const load = await client.sendMessage(chatId, {
            message: `🎧 Mencari lagu *${query}* di Spotify...`,
            parseMode: 'markdown'
        });

        try {
            const res = await axios.get(`https://api.siputzx.my.id/api/s/spotify?query=${encodeURIComponent(query)}`);
            const data = res.data.data?.[0];

            if (!data) {
                await client.editMessage(load, { message: '❌ Lagu tidak ditemukan.' });
                return;
            }

            const dl = await axios.get(
                `https://api.siputzx.my.id/api/d/spotifyv2?url=${encodeURIComponent(data.track_url)}`
            );
            const song = dl.data.data;

            if (!song?.mp3DownloadLink)
                return client.editMessage(load, { message: '❌ Gagal download lagu.' });

            const filePath = path.join(__dirname, `${uuidv4()}.mp3`);
            const audio = await axios.get(song.mp3DownloadLink, { responseType: 'stream' });
            const writer = fs.createWriteStream(filePath);

            audio.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            await client.sendFile(chatId, {
                file: filePath,
                caption: `🎶 *${song.title}*\n👤 ${song.artist}`,
                parseMode: 'markdown'
            });

            setTimeout(() => {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }, 1200);

            if (load?.id) client.deleteMessages(chatId, [load.id]);

        } catch (err) {
            await client.sendMessage(chatId, { message: `❌ Error: ${err.message}` });
        }
    }
        break;


    // ============ .tt (TikTok) ============
    case 'tt': {
        const link = args[0];
        if (!link)
            return client.sendMessage(chatId, { message: '❌ Contoh: `.tt https://vt.tiktok.com/...`' });

        const wait = await client.sendMessage(chatId, { message: '🔎 Mendownload video TikTok...' });

        try {
            const res = await axios.get('https://api.siputzx.my.id/api/d/tiktok', {
                params: { url: link }
            });

            const video =
                res.data.data.urls?.[0] ||
                res.data.data.url ||
                res.data.data.original_url;

            if (!video)
                return client.sendMessage(chatId, { message: '❌ Gagal ambil link video.' });

            await client.sendMessage(chatId, {
                video: { url: video },
                caption: '🎬 Video TikTok siap!'
            });

        } catch (e) {
            await client.sendMessage(chatId, { message: `⚠️ Error TikTok: ${e.message}` });
        }
    }
        break;


    // ============ .parsenik ============
    case 'parsenik': {
        const nik = args[0];
        if (!nik || nik.length !== 16)
            return client.sendMessage(chatId, { message: '❌ Contoh: `.parsenik 3510050212040003`' });

        await client.sendMessage(chatId, { message: '⏳ Sedang memproses NIK...' });

        try {
            const res = await axios.get(
                `https://api.siputzx.my.id/api/tools/nik-checker?nik=${nik}`
            );

            const main = res.data?.data?.data;
            const meta = res.data?.data?.metadata;

            if (!main?.nama)
                return client.sendMessage(chatId, { message: '⚠️ Data tidak ditemukan.' });

            const hasil = `
🧾 HASIL PARSE NIK

👤 Nama: ${main.nama}
🧠 Zodiak: ${main.zodiak}
🪪 NIK: \`${nik}\`
🚹 Jenis Kelamin: ${main.kelamin}
🎂 Tanggal Lahir: ${main.tempat_lahir}
📆 Usia: ${main.usia}
📅 Ultah Berikutnya: ${main.ultah_mendatang}
🏙️ Provinsi: ${main.provinsi}
🏢 Kabupaten: ${main.kabupaten}
🏘️ Kecamatan: ${main.kecamatan}
🏠 Kelurahan: ${main.kelurahan}
📍 Alamat: ${main.alamat}
`;

            await client.sendMessage(chatId, { message: hasil, parseMode: 'markdown' });

        } catch (err) {
            await client.sendMessage(chatId, { message: `❌ Error: ${err.message}` });
        }
    }
        break;

            case 'cfd':
case 'cfdall':
case 'cfdgroup': {

    const mode = cmd === "cfdgroup" ? "group" : "all";

    if (!message.replyToMsgId) {
        return client.sendMessage(chatId, {
            message: "⚠️ Harus reply pesan untuk diforward!",
            replyToMsgId: message.id
        });
    }

    const replyMsg = await msg.getReplyMessage();
    if (!replyMsg) {
        return client.sendMessage(chatId, { message: "❌ Gagal ambil pesan reply!" });
    }

    try {
        const dialogs = await client.getDialogs();

        const targets = dialogs.filter(d => {
            if (mode === "group") return d.isGroup && !blacklist.includes(d.id.toString());
            return !blacklist.includes(d.id.toString());
        });

        let count = 0;
        const total = targets.length;

        const progressMsg = await client.sendMessage(chatId, {
            message: `🚀 Memulai forward ke ${total} chat...`
        });

        for (const dialog of targets) {
            try {
                await client.forwardMessages(dialog.id, {
                    messages: replyMsg.id,
                    fromPeer: chatId
                });
                count++;
            } catch (err) {
                console.log(`⚠️ Gagal forward ke ${dialog.name}: ${err.message}`);
            }
        }

        await client.editMessage(progressMsg, {
            message: `✅ Selesai! Pesan diteruskan ke ${count} chat${mode === "group" ? " grup" : ""}.`
        });

    } catch (e) {
        console.error("Error cfd:", e);
        await client.sendMessage(chatId, {
            message: `❌ Gagal menjalankan cfd.\nError: ${e.message.slice(0, 50)}...`
        });
    }

}
break;

case 'spam': {
    const args = text.slice(cmd.length + 2).trim(); 
    // contoh: ".spam halo kontol,10"

    if (!args.includes(',')) {
        await client.sendMessage(chatId, { message: '⚠️ Format salah!\nGunakan: `.spam teks, jumlah`' });
        break;
    }

    // pisah teks & jumlah
    const [spamTextRaw, countStr] = args.split(',');
    const spamText = spamTextRaw.trim();
    const count = parseInt(countStr.trim());

    // validasi
    if (!spamText) {
        await client.sendMessage(chatId, { message: '⚠️ Teks spam tidak boleh kosong' });
        break;
    }

    if (isNaN(count) || count <= 0) {
        await client.sendMessage(chatId, { message: '⚠️ Jumlah harus angka lebih dari 0' });
        break;
    }

    // info mulai
    await client.sendMessage(chatId, { message: `🚀 Mengirim spam ${count}x...` });

    // loop spam
    for (let i = 0; i < count; i++) {
        try {
            await client.sendMessage(chatId, { message: spamText });
            await new Promise(r => setTimeout(r, 500)); 
        } catch (err) {
            console.log(`⚠️ Gagal kirim spam ke chatId ${chatId}: ${err.message}`);
            break;
        }
    }

    // selesai
    await client.sendMessage(chatId, { message: `✅ Selesai mengirim ${count} pesan.` });
}
break;

            case 'self':
                isSelfMode = true;
                await client.sendMessage(chatId, { message: "Bot is set to <b>Self mode</b>", parseMode: 'html' });
                break;

            case 'public':
                isSelfMode = false;
                await client.sendMessage(chatId, { message: "Bot is set to <b>Public Mode</b>", parseMode: 'html' });
                break;
                
            case 'info':
                try {
                    let target = selfUser;
                    if (text) {
                        target = await client.getEntity(text);
                    }
                    
                    const fullUser = await client.invoke(
                        new Api.users.GetFullUser({ id: target })
                    );
                    
                    const infoText = `
<b>--- Account Info ---</b>
👤 Name: ${target.firstName} ${target.lastName || ''}
🔖 Username: @${target.username || 'N/A'}
🆔 ID: <code>${target.id}</code>
🌐 DC: ${target.dcId || 'N/A'}
🌟 Premium: ${target.premium ? 'Yes' : 'No'}
Bio: ${fullUser.fullUser.about || 'No description'}
`;
                    await client.sendMessage(chatId, { message: infoText, parseMode: 'html' });

                } catch (e) {
                    console.error("Error info:", e);
                    await client.sendMessage(chatId, { message: `Failed to get account info. Error: ${e.message.slice(0, 50)}...` });
                }
                break;
                
            case 'afk':
                if (afk.isAfk) {
                    return client.sendMessage(chatId, { message: "You are already in AFK mode. Type <code>.unafk</code> to return..", parseMode: 'html' });
                }
                afk.isAfk = true;
                afk.reason = text || 'No reason';
                afk.since = Date.now();
                await client.sendMessage(chatId, { message: `You are now <b>AFK</b>.\nReason: <i>${afk.reason}</i>`, parseMode: 'html' });
                break;
                
            case 'unafk':
                if (!afk.isAfk) {
                    return client.sendMessage(chatId, { message: "You are not AFK." });
                }
                afk.isAfk = false;
                afk.reason = "";
                afk.since = null;
                await client.sendMessage(chatId, { message: "<b>Welcome back!</b> You are no longer AFK.", parseMode: 'html' });
                break;
                
            case 'xnxx':
    if (!text) {
        return client.sendMessage(chatId, {
            message: `Usage: <b>${prefix}xnxx <query></b>`,
            parseMode: 'html'
        });
    }

    const loadingXnxx = await client.sendMessage(chatId, {
        message: `🔍 Searching <b>${text}</b> ...`,
        parseMode: 'html'
    });

    try {
        const searchUrl = `https://restapi-v2.simplebot.my.id/search/xnxx?q=${encodeURIComponent(text)}`;
        const search = await axios.get(searchUrl);

        if (!search.data.status || !search.data.result || search.data.result.length === 0) {
            await client.deleteMessages(chatId, [loadingXnxx.id]);
            return client.sendMessage(chatId, { message: "❌ No result found." });
        }

        const top = search.data.result[0];
        const title = top.title;
        const link = top.link;

        await client.sendMessage(chatId, {
            message: `✅ Found: <b>${title}</b>\nFetching download link...`,
            parseMode: 'html'
        });

        const dlUrl = `https://restapi-v2.simplebot.my.id/download/xnxx?url=${encodeURIComponent(link)}`;
        const dl = await axios.get(dlUrl);

        if (!dl.data.result) {
            await client.deleteMessages(chatId, [loadingXnxx.id]);
            return client.sendMessage(chatId, { message: "❌ Failed to fetch video data." });
        }

        const r = dl.data.result;
        const high = r.files?.high;
        const low = r.files?.low;
        const info = r.info || "";

        const viewMatch = info.match(/(\d[\d.,]*[KMB]?)/g);
        const views = viewMatch ? viewMatch.pop() : "Unknown";

        const durationSec = parseInt(r.duration) || 0;
        const durasi = `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`;

        const caption = `
<b>${title}</b>
⏱ Duration: ${durasi}
👁 Views: ${views}
🔗 Resolution: ${high ? "High" : low ? "Low" : "N/A"}

<b>ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴏᴛᴀx</b>
        `;

        await client.deleteMessages(chatId, [loadingXnxx.id]);

        if (high) {
            await client.sendMessage(chatId, {
                message: caption + `\n\n<a href="${high}">High Quality Link</a>`,
                parseMode: "html",
                linkPreview: true
            });
        } else if (low) {
            await client.sendMessage(chatId, {
                message: caption + `\n\n<a href="${low}">Low Quality Link</a>`,
                parseMode: "html",
                linkPreview: true
            });
        } else {
            await client.sendMessage(chatId, {
                message: "❌ Can't retrieve video URL."
            });
        }

    } catch (e) {
        console.error("XNXX ERROR:", e);
        await client.deleteMessages(chatId, [loadingXnxx.id]).catch(() => { });

        await client.sendMessage(chatId, {
            message: `❌ Error: ${e.message.slice(0, 60)}...`
        });
    }
    break;
                
            case 'brat':
                if (!text) {
                    return client.sendMessage(
                        chatId,
                        `<b>Usage:</b> <code>${prefix}brat <Your Message></code>`,
                        { parseMode: 'html' }
                    );
                }

                const bratText = encodeURIComponent(text);
                const isAnimated = false; 
                const delay = 100; 
                const bratApiUrl = `https://api.siputzx.my.id/api/m/brat?text=${bratText}&isAnimated=${isAnimated}&delay=${delay}`;

                const loadingBratMsg = await client.sendMessage(
                    chatId,
                    `<b>Processing...</b> Generating Brat Text image for: <i>${text.slice(0, 30)}...</i>`,
                    { parseMode: 'html' }
                );

                try {
                    const res = await axios.get(bratApiUrl, { responseType: 'arraybuffer' });
                    
                    if (res.status !== 200 || res.headers['content-type'] !== 'image/png') {
                         await client.deleteMessages(chatId, [loadingBratMsg.id]);
                         return client.sendMessage(
                            chatId,
                            '<b>Error:</b> API failed to return an image. Please try again later.',
                            { parseMode: 'html' }
                        );
                    }

                    const buffer = Buffer.from(res.data);

                    await client.sendMessage(chatId, {
                        message: `<b>Brat Image Generated!</b>\n\nQuery: <i>${text}</i>\n\nᴄʀᴇᴀᴛᴇ ʙʏ ᴏᴛᴀx⸙`,
                        file: buffer,
                        caption: `<b>Brat Image Generated!</b>\n\nQuery: <i>${text}</i>\n\nᴄʀᴇᴀᴛᴇ ʙʏ ᴏᴛᴀx⸙`,
                        parseMode: 'html',
                        replyTo: message.id 
                    });

                    await client.deleteMessages(chatId, [loadingBratMsg.id]).catch(() => {});

                } catch (e) {
                    console.error(" Error:", e);
                    
                    await client.deleteMessages(chatId, [loadingBratMsg.id]).catch(() => {}); 
                    
                    client.sendMessage(
                        chatId,
                        `<b>Error:</b> An error occurred while contacting the API. Error: ${e.message.slice(0, 50)}...`,
                        { parseMode: 'html', replyTo: message.id }
                    );
                }
                break;

            case 'tourl':
                if (!message.replyTo) {
                    return client.sendMessage(chatId, { message: `Reply pesan media (photo, video, document, audio, sticker/gif) with <b>${prefix}tourl</b>.`, parseMode: 'html' });
                }

                const repliedMessageId = message.replyTo.replyToMsgId;
                let filePath = null;
                
                try {
                    await client.sendMessage(chatId, { message: 'Downloading media, please wait...' });
                    const repliedMsg = await client.getMessages(chatId, { ids: repliedMessageId });
                    const media = repliedMsg[0]?.media;

                    if (!media) {
                        return client.sendMessage(chatId, { message: "Media not found in the replied message." });
                    }

                    const mediaBuffer = await client.downloadMedia(media);
                    let mimeType = repliedMsg[0]?.document?.mimeType || repliedMsg[0]?.video?.mimeType || 'application/octet-stream';
                    let fileName = repliedMsg[0]?.document?.attributes?.find(attr => attr.className === 'DocumentAttributeFilename')?.fileName || '';
                    const ext = getFileExtension(mimeType, fileName);
                    filePath = path.join(__dirname, `temp_${Date.now()}${ext}`);
                    await fs.promises.writeFile(filePath, mediaBuffer);
                    const url = await CatBox(filePath);
                    await client.sendMessage(chatId, { 
                        message: `📦 <b>CatBox URL:</b>\n<a href="${url}">${url}</a>`, 
                        parseMode: 'html',
                        replyTo: repliedMessageId 
                    });

                } catch (error) {
                    console.error("Error tourl:", error);
                    await client.sendMessage(chatId, { 
                        message: `Error: ${error.message || error}`, 
                        replyTo: message.id 
                    });
                } finally {
                    if (filePath && fs.existsSync(filePath)) {
                        fs.unlink(filePath, (err) => {
                            if (err) console.error("Error:", err);
                        });
                    }
                }
                break;
        }

    }, new NewMessage({}));
    
    console.log("Bot Active");
}

run();