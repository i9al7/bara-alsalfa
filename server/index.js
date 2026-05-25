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

const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*" }
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

app.get("/api/categories", (req, res) => {
    res.json(manager.categories);
});

app.use(express.static(path.join(__dirname, "../client/dist")));

app.use((req, res) => {
    res.sendFile(path.join(__dirname, "../client/dist/index.html"));
});

function emitRoom(roomCode) {
    if (!roomCode) return;

    const players = manager.getPlayers(roomCode);

    for (const player of players) {
        io.to(player.id).emit(
            "game:update",
            manager.privateGameFor(roomCode, player.id)
        );
    }
}

function emitSocket(socketId) {
    const roomCode = manager.getSocketRoom(socketId);
    if (!roomCode) return;

    io.to(socketId).emit(
        "game:update",
        manager.privateGameFor(roomCode, socketId)
    );
}

setInterval(() => {
    const updatedRooms = manager.autoNextTurnAllRooms();

    for (const roomCode of updatedRooms) {
        emitRoom(roomCode);
    }
}, 1000);

io.on("connection", socket => {
    console.log("Player connected:", socket.id);

    socket.on("lobby:create", ({ user }) => {
        try {
            if (!user) {
                socket.emit("lobby:error", "INVALID_USER");
                return;
            }

            const result = manager.createLobby(socket.id, {
                id: user.id,
                username: user.username,
                avatar: user.avatar
            });

            if (!result.ok) {
                socket.emit("lobby:error", result.error || "CREATE_FAILED");
                return;
            }

            socket.join(result.roomCode);
            socket.emit("lobby:joined");

            emitRoom(result.roomCode);

            console.log(`${user.username} created room ${result.roomCode}`);
        } catch (err) {
            console.error(err);
            socket.emit("lobby:error", "CREATE_FAILED");
        }
    });

    socket.on("lobby:join", ({ code, user }) => {
        try {
            if (!user) {
                socket.emit("lobby:error", "INVALID_USER");
                return;
            }

            if (!code) {
                socket.emit("lobby:error", "INVALID_CODE");
                return;
            }

            const roomCode = code.toUpperCase();

            const result = manager.joinLobby(roomCode, socket.id, {
                id: user.id,
                username: user.username,
                avatar: user.avatar
            });

            if (!result.ok) {
                socket.emit("lobby:error", result.error || "JOIN_FAILED");
                return;
            }

            socket.join(roomCode);
            socket.emit("lobby:joined");

            emitRoom(roomCode);

            console.log(`${user.username} joined room ${roomCode}`);
        } catch (err) {
            console.error(err);
            socket.emit("lobby:error", "JOIN_FAILED");
        }
    });

    socket.on("host:settings", settings => {
        const roomCode = manager.getSocketRoom(socket.id);
        if (!roomCode) return;

        manager.setSettings(roomCode, socket.id, settings);
        emitRoom(roomCode);
    });

    socket.on("lobby:ready", () => {
        const roomCode = manager.getSocketRoom(socket.id);
        if (!roomCode) return;

        manager.toggleLobbyReady(roomCode, socket.id);
        emitRoom(roomCode);
    });

    socket.on("game:start", () => {
        const roomCode = manager.getSocketRoom(socket.id);
        if (!roomCode) return;

        const result = manager.startGame(roomCode, socket.id);

        socket.emit("game:startResult", result);
        emitRoom(roomCode);
    });

    socket.on("turn:next", () => {
        const roomCode = manager.getSocketRoom(socket.id);
        if (!roomCode) return;

        manager.nextTurn(roomCode, socket.id);
        emitRoom(roomCode);
    });

    socket.on("vote:ready", () => {
        const roomCode = manager.getSocketRoom(socket.id);
        if (!roomCode) return;

        manager.readyToVote(roomCode, socket.id);
        emitRoom(roomCode);
    });

    socket.on("vote:cast", targetId => {
        const roomCode = manager.getSocketRoom(socket.id);
        if (!roomCode) return;

        manager.vote(roomCode, socket.id, targetId);
        emitRoom(roomCode);
    });

    socket.on("spy:guess", guess => {
        const roomCode = manager.getSocketRoom(socket.id);
        if (!roomCode) return;

        manager.spyGuess(roomCode, socket.id, guess);
        emitRoom(roomCode);
    });

    socket.on("game:reset", () => {
        const roomCode = manager.getSocketRoom(socket.id);
        if (!roomCode) return;

        manager.resetGame(roomCode, socket.id);
        emitRoom(roomCode);
    });

    socket.on("disconnect", () => {
        console.log("Player disconnected:", socket.id);

        const roomCode = manager.getSocketRoom(socket.id);

        manager.removePlayer(socket.id);

        if (roomCode) {
            emitRoom(roomCode);
        }
    });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on ${PORT}`);
});