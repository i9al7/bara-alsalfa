require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const manager = require("./gameManager");

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "../client/dist")));

app.use((req, res) => {
    res.sendFile(path.join(__dirname, "../client/dist/index.html"));
});

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

app.post("/api/discord/token", async (req, res) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({ error: "Missing code" });
        }

        const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
                client_id: process.env.DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                grant_type: "authorization_code",
                code
            })
        });

        const tokenData = await tokenRes.json();

        if (!tokenRes.ok) {
            return res.status(400).json(tokenData);
        }

        const userRes = await fetch("https://discord.com/api/users/@me", {
            headers: {
                Authorization: `Bearer ${tokenData.access_token}`
            }
        });

        const user = await userRes.json();

        return res.json({
            user,
            access_token: tokenData.access_token
        });
    } catch (err) {
        console.error("Discord auth error:", err);
        res.status(500).json({ error: "Discord auth failed" });
    }
});

function emitGame() {
    for (const socket of io.sockets.sockets.values()) {
        socket.emit("game:update", manager.privateGameFor(socket.id));
    }
}

setInterval(() => {
    const changed = manager.autoNextTurnIfNeeded();

    if (changed) {
        emitGame();
    } else {
        emitGame();
    }
}, 1000);

io.on("connection", socket => {
    socket.on("player:join", name => {
        manager.addPlayer(socket.id, name || `Player-${socket.id.slice(0, 4)}`);
        emitGame();
    });

    socket.on("host:settings", settings => {
        manager.setSettings(socket.id, settings);
        emitGame();
    });

    socket.on("game:start", () => {
        const res = manager.startGame(socket.id);
        socket.emit("game:startResult", res);
        emitGame();
    });

    socket.on("turn:next", () => {
        manager.nextTurn();
        emitGame();
    });

    socket.on("vote:ready", () => {
        manager.readyToVote(socket.id);
        emitGame();
    });

    socket.on("vote:cast", targetId => {
        manager.vote(socket.id, targetId);
        emitGame();
    });

    socket.on("spy:guess", guess => {
        manager.spyGuess(socket.id, guess);
        emitGame();
    });

    socket.on("game:reset", () => {
        manager.resetGame();
        emitGame();
    });

    socket.on("disconnect", () => {
        manager.removePlayer(socket.id);
        emitGame();
    });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});