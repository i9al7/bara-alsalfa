const categories = require("./words");

const DEFAULT_CATEGORY = "food";
const DEFAULT_TIME_LIMIT = 60;
const DEFAULT_LANG = "ar";
const MIN_PLAYERS = 3;

const rooms = new Map();
const socketRooms = new Map();

function createInitialGame(keepPlayers = []) {
    return {
        state: "LOBBY",
        hostId: keepPlayers[0]?.id || null,
        category: DEFAULT_CATEGORY,
        lang: DEFAULT_LANG,
        timeLimit: DEFAULT_TIME_LIMIT,
        turnStartedAt: null,
        roomCode: null,

        lobbyReady: [],
        questionQueue: [],
        currentTurnIndex: 0,

        players: keepPlayers,

        spyId: null,
        word: null,
        askerId: null,
        targetId: null,
        askedTurns: [],

        ready: [],
        votes: {},

        result: null,
        votedPlayerId: null,
        spyGuess: null
    };
}

function generateRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ123456789";
    let code = "";

    do {
        code = "";
        for (let i = 0; i < 5; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
    } while (rooms.has(code));

    return code;
}

function getGame(roomCode) {
    return rooms.get(roomCode);
}

function getSocketRoom(socketId) {
    return socketRooms.get(socketId) || null;
}

function getPlayers(roomCode) {
    const game = getGame(roomCode);
    return game?.players || [];
}

function getPlayer(game, socketId) {
    return game.players.find(player => player.id === socketId);
}

function getTimeLeft(game) {
    if (!game.turnStartedAt || game.state !== "QUESTIONING") return 0;

    const elapsed = Math.floor((Date.now() - game.turnStartedAt) / 1000);
    return Math.max(game.timeLimit - elapsed, 0);
}

function getCategoryWords(game) {
    const category = categories[game.category] || categories[DEFAULT_CATEGORY];
    const words = category.words;

    if (Array.isArray(words)) return words;

    return words[game.lang] || words[DEFAULT_LANG] || [];
}

function publicGame(roomCode) {
    const game = getGame(roomCode);
    if (!game) return null;

    return {
        ...game,
        currentAsker: getPlayer(game, game.askerId),
        currentTarget: getPlayer(game, game.targetId),
        word: game.state === "RESULTS" ? game.word : null,
        spyId: game.state === "RESULTS" ? game.spyId : null,
        timeLeft: getTimeLeft(game)
    };
}

function privateGameFor(roomCode, playerId) {
    const game = getGame(roomCode);
    if (!game) return null;

    const base = publicGame(roomCode);

    return {
        ...base,
        myRole: playerId === game.spyId ? "SPY" : "PLAYER",
        myWord: playerId === game.spyId ? null : game.word,
        hasVoted: Boolean(game.votes[playerId]),
        isReady: game.ready.includes(playerId)
    };
}

function createLobby(hostId, user) {
    if (!user) return { ok: false, error: "INVALID_USER" };

    const roomCode = generateRoomCode();
    const game = createInitialGame();

    game.roomCode = roomCode;
    game.hostId = hostId;

    const player = {
        id: hostId,
        socketId: hostId,
        discordId: user.id,
        name: user.username || "Player",
        avatar: user.avatar || null
    };

    game.players.push(player);

    rooms.set(roomCode, game);
    socketRooms.set(hostId, roomCode);

    return { ok: true, roomCode };
}

function joinLobby(roomCode, socketId, user) {
    const game = getGame(roomCode);

    if (!game) return { ok: false, error: "INVALID_CODE" };
    if (!user) return { ok: false, error: "INVALID_USER" };

    const oldRoom = socketRooms.get(socketId);
    if (oldRoom && oldRoom !== roomCode) {
        removePlayer(socketId);
    }

    const alreadyConnected = getPlayer(game, socketId);
    if (alreadyConnected) {
        socketRooms.set(socketId, roomCode);
        return { ok: true, player: alreadyConnected };
    }

    const duplicateDiscord = game.players.find(player => player.discordId === user.id);

    if (duplicateDiscord) {
        duplicateDiscord.id = socketId;
        duplicateDiscord.socketId = socketId;

        socketRooms.set(socketId, roomCode);

        if (!game.hostId) game.hostId = socketId;

        return { ok: true, player: duplicateDiscord };
    }

    const player = {
        id: socketId,
        socketId,
        discordId: user.id,
        name: user.username || "Player",
        avatar: user.avatar || null
    };

    game.players.push(player);
    socketRooms.set(socketId, roomCode);

    if (!game.hostId) game.hostId = socketId;

    return { ok: true, player };
}

function removePlayer(socketId) {
    const roomCode = socketRooms.get(socketId);
    if (!roomCode) return;

    const game = getGame(roomCode);
    if (!game) {
        socketRooms.delete(socketId);
        return;
    }

    game.players = game.players.filter(player => player.id !== socketId);
    game.ready = game.ready.filter(id => id !== socketId);
    game.lobbyReady = game.lobbyReady.filter(id => id !== socketId);

    delete game.votes[socketId];

    for (const voterId of Object.keys(game.votes)) {
        if (game.votes[voterId] === socketId) {
            delete game.votes[voterId];
        }
    }

    if (game.hostId === socketId) {
        game.hostId = game.players[0]?.id || null;
    }

    socketRooms.delete(socketId);

    if (game.players.length === 0) {
        rooms.delete(roomCode);
    }
}

function setSettings(roomCode, socketId, settings) {
    const game = getGame(roomCode);
    if (!game) return { ok: false, error: "INVALID_ROOM" };

    if (socketId !== game.hostId) {
        return { ok: false, error: "ONLY_HOST" };
    }

    if (game.state !== "LOBBY") {
        return { ok: false, error: "GAME_ALREADY_STARTED" };
    }

    if (settings.category && categories[settings.category]) {
        game.category = settings.category;
    }

    if (settings.lang && ["ar", "en"].includes(settings.lang)) {
        game.lang = settings.lang;
    }

    const nextLimit = Number(settings.timeLimit);

    if ([30, 45, 60, 90, 120].includes(nextLimit)) {
        game.timeLimit = nextLimit;
    }

    return { ok: true };
}

function toggleLobbyReady(roomCode, playerId) {
    const game = getGame(roomCode);
    if (!game) return { ok: false, error: "INVALID_ROOM" };

    if (game.state !== "LOBBY") return { ok: false, error: "INVALID_STATE" };
    if (!getPlayer(game, playerId)) return { ok: false, error: "PLAYER_NOT_FOUND" };

    if (game.lobbyReady.includes(playerId)) {
        game.lobbyReady = game.lobbyReady.filter(id => id !== playerId);
    } else {
        game.lobbyReady.push(playerId);
    }

    return { ok: true };
}

function randomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function shuffleArray(arr) {
    return [...arr].sort(() => Math.random() - 0.5);
}

function buildQuestionQueue(game) {
    if (game.players.length === 1) {
        game.questionQueue = [
            {
                askerId: game.players[0].id,
                targetId: game.players[0].id
            }
        ];

        game.currentTurnIndex = 0;
        return;
    }

    const shuffled = shuffleArray(game.players);

    game.questionQueue = shuffled.map((player, index) => {
        const nextPlayer = shuffled[(index + 1) % shuffled.length];

        return {
            askerId: player.id,
            targetId: nextPlayer.id
        };
    });

    game.currentTurnIndex = 0;
}

function pickNextTurn(game) {
    if (game.currentTurnIndex >= game.questionQueue.length) {
        game.state = "READY_TO_VOTE";
        game.turnStartedAt = null;
        return;
    }

    const turn = game.questionQueue[game.currentTurnIndex];

    game.askerId = turn.askerId;
    game.targetId = turn.targetId;
    game.askedTurns.push(turn);

    game.currentTurnIndex += 1;
    game.turnStartedAt = Date.now();
}

function startGame(roomCode, socketId) {
    const game = getGame(roomCode);
    if (!game) return { ok: false, error: "INVALID_ROOM" };

    if (socketId !== game.hostId) {
        return { ok: false, error: "ONLY_HOST" };
    }

    if (game.state !== "LOBBY") {
        return { ok: false, error: "GAME_ALREADY_STARTED" };
    }

    if (game.players.length < MIN_PLAYERS) {
        return { ok: false, error: "NEED_3_PLAYERS" };
    }

    if (game.lobbyReady.length < MIN_PLAYERS || game.lobbyReady.length !== game.players.length) {
        return { ok: false, error: "PLAYERS_NOT_READY" };
    }

    const categoryWords = getCategoryWords(game);

    if (!categoryWords.length) {
        return { ok: false, error: "NO_WORDS" };
    }

    game.state = "QUESTIONING";
    game.spyId = randomItem(game.players).id;
    game.word = randomItem(categoryWords);

    game.askerId = null;
    game.targetId = null;
    game.askedTurns = [];

    game.ready = [];
    game.votes = {};

    game.result = null;
    game.votedPlayerId = null;
    game.spyGuess = null;

    game.turnStartedAt = null;
    game.questionQueue = [];
    game.currentTurnIndex = 0;

    buildQuestionQueue(game);
    pickNextTurn(game);

    return { ok: true };
}

function nextTurn(roomCode, socketId) {
    const game = getGame(roomCode);
    if (!game) return { ok: false, error: "INVALID_ROOM" };

    if (socketId && socketId !== game.hostId) {
        return { ok: false, error: "ONLY_HOST" };
    }

    if (game.state !== "QUESTIONING") {
        return { ok: false, error: "INVALID_STATE" };
    }

    pickNextTurn(game);
    return { ok: true };
}

function autoNextTurnIfNeeded(roomCode) {
    const game = getGame(roomCode);
    if (!game) return false;

    if (game.state !== "QUESTIONING") return false;

    if (getTimeLeft(game) <= 0) {
        pickNextTurn(game);
        return true;
    }

    return false;
}

function autoNextTurnAllRooms() {
    const changedRooms = [];

    for (const roomCode of rooms.keys()) {
        if (autoNextTurnIfNeeded(roomCode)) {
            changedRooms.push(roomCode);
        }
    }

    return changedRooms;
}

function readyToVote(roomCode, playerId) {
    const game = getGame(roomCode);
    if (!game) return { ok: false, error: "INVALID_ROOM" };

    if (!getPlayer(game, playerId)) return { ok: false, error: "PLAYER_NOT_FOUND" };

    if (game.state !== "QUESTIONING" && game.state !== "READY_TO_VOTE") {
        return { ok: false, error: "INVALID_STATE" };
    }

    if (!game.ready.includes(playerId)) {
        game.ready.push(playerId);
    }

    if (game.ready.length === game.players.length) {
        game.state = "VOTING";
        game.turnStartedAt = null;
    }

    return { ok: true };
}

function vote(roomCode, voterId, targetId) {
    const game = getGame(roomCode);
    if (!game) return { ok: false, error: "INVALID_ROOM" };

    if (game.state !== "VOTING") return { ok: false, error: "INVALID_STATE" };
    if (!getPlayer(game, voterId)) return { ok: false, error: "VOTER_NOT_FOUND" };
    if (!getPlayer(game, targetId)) return { ok: false, error: "INVALID_TARGET" };

    if (voterId === targetId && game.players.length > 1) {
        return { ok: false, error: "CANT_VOTE_SELF" };
    }

    if (game.votes[voterId]) return { ok: false, error: "ALREADY_VOTED" };

    game.votes[voterId] = targetId;

    if (Object.keys(game.votes).length === game.players.length) {
        finishVoting(game);
    }

    return { ok: true };
}

function finishVoting(game) {
    const counts = {};

    Object.values(game.votes).forEach(targetId => {
        counts[targetId] = (counts[targetId] || 0) + 1;
    });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) {
        game.state = "RESULTS";
        game.result = "DRAW";
        game.votedPlayerId = null;
        return;
    }

    const votedPlayerId = sorted[0]?.[0];

    game.votedPlayerId = votedPlayerId;

    if (votedPlayerId === game.spyId) {
        game.state = "SPY_GUESS";
    } else {
        game.state = "RESULTS";
        game.result = "SPY_WINS";
    }
}

function spyGuess(roomCode, playerId, guess) {
    const game = getGame(roomCode);
    if (!game) return { ok: false, error: "INVALID_ROOM" };

    if (game.state !== "SPY_GUESS") return { ok: false, error: "INVALID_STATE" };
    if (playerId !== game.spyId) return { ok: false, error: "ONLY_SPY" };

    game.spyGuess = guess;
    game.state = "RESULTS";

    if (guess === game.word) {
        game.result = "SPY_WINS";
    } else {
        game.result = "PLAYERS_WIN";
    }

    return { ok: true };
}

function resetGame(roomCode, socketId) {
    const oldGame = getGame(roomCode);
    if (!oldGame) return { ok: false, error: "INVALID_ROOM" };

    if (socketId && socketId !== oldGame.hostId) {
        return { ok: false, error: "ONLY_HOST" };
    }

    const players = oldGame.players;

    const game = createInitialGame(players);
    game.roomCode = roomCode;
    game.hostId = players[0]?.id || null;

    rooms.set(roomCode, game);

    for (const player of players) {
        socketRooms.set(player.id, roomCode);
    }

    return { ok: true };
}

module.exports = {
    categories,
    publicGame,
    privateGameFor,

    getSocketRoom,
    getPlayers,

    createLobby,
    joinLobby,
    removePlayer,

    setSettings,
    toggleLobbyReady,

    startGame,
    nextTurn,
    autoNextTurnIfNeeded,
    autoNextTurnAllRooms,

    readyToVote,
    vote,
    spyGuess,

    resetGame
};