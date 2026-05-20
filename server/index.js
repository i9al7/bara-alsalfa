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
    cors: {
        origin: "*"
    }
});

app.post("/api/discord/token", async (req, res) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({
                error: "Missing code"
            });
        }

        const tokenRes = await fetch(
            "https://discord.com/api/oauth2/token",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },
                body: new URLSearchParams({
                    client_id: process.env.DISCORD_CLIENT_ID,
                    client_secret:
                        process.env.DISCORD_CLIENT_SECRET,
                    grant_type: "authorization_code",
                    code
                })
            }
        );

        const tokenData = await tokenRes.json();

        if (!tokenRes.ok) {
            return res.status(400).json(tokenData);
        }

        const userRes = await fetch(
            "https://discord.com/api/users/@me",
            {
                headers: {
                    Authorization: `Bearer ${tokenData.access_token}`
                }
            }
        );

        const user = await userRes.json();

        return res.json({
            user,
            access_token: tokenData.access_token
        });

    } catch (err) {
        console.error("Discord auth error:", err);

        res.status(500).json({
            error: "Discord auth failed"
        });
    }
});

app.get("/api/categories", (req, res) => {
    res.json(manager.categories);
});

app.use(
    express.static(
        path.join(__dirname, "../client/dist")
    )
);

app.use((req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            "../client/dist/index.html"
        )
    );
});

function emitGame() {
    for (const socket of io.sockets.sockets.values()) {
        socket.emit(
            "game:update",
            manager.privateGameFor(socket.id)
        );
    }
}

setInterval(() => {
    manager.autoNextTurnIfNeeded();
    emitGame();
}, 1000);

io.on("connection", socket => {

    console.log("Player connected:", socket.id);

    socket.on("lobby:create", ({ user }) => {

        try {

            if (!user) {
                socket.emit(
                    "lobby:error",
                    "INVALID_USER"
                );
                return;
            }

            manager.createLobby(socket.id);

            manager.addPlayer(socket.id, {
                id: user.id,
                username: user.username,
                avatar: user.avatar
            });

            socket.emit("lobby:joined");

            emitGame();

            console.log(
                "Lobby created by:",
                user.username
            );

        } catch (err) {

            console.error(err);

            socket.emit(
                "lobby:error",
                "CREATE_FAILED"
            );
        }
    });

    socket.on("lobby:join", ({ code, user }) => {

        try {

            if (!user) {
                socket.emit(
                    "lobby:error",
                    "INVALID_USER"
                );
                return;
            }

            if (!code) {
                socket.emit(
                    "lobby:error",
                    "INVALID_CODE"
                );
                return;
            }

            if (
                manager.getRoomCode() !==
                code.toUpperCase()
            ) {
                socket.emit(
                    "lobby:error",
                    "INVALID_CODE"
                );
                return;
            }

            manager.addPlayer(socket.id, {
                id: user.id,
                username: user.username,
                avatar: user.avatar
            });

            socket.emit("lobby:joined");

            emitGame();

            console.log(
                `${user.username} joined room ${code}`
            );

        } catch (err) {

            console.error(err);

            socket.emit(
                "lobby:error",
                "JOIN_FAILED"
            );
        }
    });

    socket.on("host:settings", settings => {

        manager.setSettings(
            socket.id,
            settings
        );

        emitGame();
    });

    socket.on("game:start", () => {

        const result =
            manager.startGame(socket.id);

        socket.emit(
            "game:startResult",
            result
        );

        emitGame();
    });

    socket.on("turn:next", () => {

        manager.nextTurn(socket.id);

        emitGame();
    });

    socket.on("vote:ready", () => {

        manager.readyToVote(socket.id);

        emitGame();
    });

    socket.on("vote:cast", targetId => {

        manager.vote(
            socket.id,
            targetId
        );

        emitGame();
    });

    socket.on("spy:guess", guess => {

        manager.spyGuess(
            socket.id,
            guess
        );

        emitGame();
    });

    socket.on("game:reset", () => {

        manager.resetGame();

        emitGame();
    });

    socket.on("disconnect", () => {

        console.log(
            "Player disconnected:",
            socket.id
        );

        manager.removePlayer(socket.id);

        emitGame();
    });
});

const PORT =
    process.env.PORT || 3001;

server.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            `Server running on ${PORT}`
        );
    }
);