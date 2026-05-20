const categories = require("./words");



let game = {
    state: "LOBBY",
    hostId: null,
    category: "food",
    timeLimit: 60,
    turnStartedAt: null,
    questionQueue: [],
    currentTurnIndex: 0,
    players: [],
    spyId: null,
    word: null,
    askerId: null,
    targetId: null,
    askedTurns: [],
    ready: [],
    votes: {},
    result: null
};

function getTimeLeft() {
    if (!game.turnStartedAt || game.state !== "QUESTIONING") {
        return 0;
    }

    const elapsed = Math.floor((Date.now() - game.turnStartedAt) / 1000);
    return Math.max(game.timeLimit - elapsed, 0);
}

function publicGame() {
    return {
        ...game,
        currentAsker: game.players.find(p => p.id === game.askerId),
        currentTarget: game.players.find(p => p.id === game.targetId),
        word: game.state === "RESULTS" ? game.word : null,
        spyId: game.state === "RESULTS" ? game.spyId : null,
        timeLeft: getTimeLeft()
    };
}

function privateGameFor(playerId) {
    return {
        ...publicGame(),
        myRole: playerId === game.spyId ? "SPY" : "PLAYER",
        myWord: playerId === game.spyId ? null : game.word
    };
}

function addPlayer(socketId, name) {
    if (!game.hostId) game.hostId = socketId;

    const exists = game.players.find(p => p.id === socketId);

    if (!exists) {
        game.players.push({ id: socketId, name });
    }
}

function removePlayer(socketId) {
    game.players = game.players.filter(p => p.id !== socketId);

    if (game.hostId === socketId) {
        game.hostId = game.players[0]?.id || null;
    }

    if (game.players.length === 0) resetGame();
}

function setSettings(socketId, settings) {
    if (socketId !== game.hostId) return false;

    game.category = settings.category || game.category;
    game.timeLimit = Number(settings.timeLimit || game.timeLimit);

    return true;
}

function randomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function pickNextTurn() {
    if (game.currentTurnIndex >= game.questionQueue.length) {
        game.state = "READY_TO_VOTE";
        game.turnStartedAt = null;
        return;
    }

    const turn = game.questionQueue[game.currentTurnIndex];

    game.askerId = turn.askerId;
    game.targetId = turn.targetId;

    game.askedTurns.push(turn);

    game.currentTurnIndex++;

    game.turnStartedAt = Date.now();
}

function startGame(socketId) {
    if (socketId !== game.hostId) {
        return { ok: false, error: "ONLY_HOST" };
    }

    if (game.players.length < 3) {
        return { ok: false, error: "NEED_3_PLAYERS" };
    }

    const categoryWords = categories[game.category].words;

    game.state = "QUESTIONING";
    game.spyId = randomItem(game.players).id;
    game.word = randomItem(categoryWords);
    game.askerId = null;
    game.targetId = null;
    game.askedTurns = [];
    game.ready = [];
    game.votes = {};
    game.result = null;
    game.turnStartedAt = null;

    game.questionQueue = [];
    game.currentTurnIndex = 0;

    buildQuestionQueue();
    pickNextTurn();

    return { ok: true };
}

function nextTurn() {
    if (game.state !== "QUESTIONING") return;
    pickNextTurn();
}

function autoNextTurnIfNeeded() {
    if (game.state !== "QUESTIONING") return false;

    if (getTimeLeft() <= 0) {
        pickNextTurn();
        return true;
    }

    return false;
}

function readyToVote(playerId) {
    if (!game.ready.includes(playerId)) {
        game.ready.push(playerId);
    }

    if (game.ready.length === game.players.length) {
        game.state = "VOTING";
        game.turnStartedAt = null;
    }
}

function vote(voterId, targetId) {
    if (game.state !== "VOTING") return { ok: false };

    if (voterId === targetId) {
        return { ok: false, error: "CANT_VOTE_SELF" };
    }

    if (game.votes[voterId]) {
        return { ok: false, error: "ALREADY_VOTED" };
    }

    const targetExists = game.players.some(p => p.id === targetId);
    if (!targetExists) {
        return { ok: false, error: "INVALID_TARGET" };
    }

    game.votes[voterId] = targetId;

    if (Object.keys(game.votes).length === game.players.length) {
        finishVoting();
    }

    return { ok: true };
}

function finishVoting() {
    const counts = {};

    Object.values(game.votes).forEach(id => {
        counts[id] = (counts[id] || 0) + 1;
    });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) {
        game.state = "RESULTS";
        game.result = "DRAW";
        return;
    }

    const votedPlayerId = sorted[0][0];

    if (votedPlayerId === game.spyId) {
        game.state = "SPY_GUESS";
    } else {
        game.state = "RESULTS";
        game.result = "SPY_WINS";
    }
}

function spyGuess(playerId, guess) {
    if (playerId !== game.spyId) return;
    if (game.state !== "SPY_GUESS") return;

    game.state = "RESULTS";

    if (guess === game.word) {
        game.result = "SPY_WINS";
    } else {
        game.result = "PLAYERS_WIN";
    }
}

function shuffleArray(arr) {
    return [...arr].sort(() => Math.random() - 0.5);
}

function buildQuestionQueue() {
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

function resetGame() {
    game = {
        state: "LOBBY",
        hostId: game.hostId,
        category: "food",
        timeLimit: 60,
        turnStartedAt: null,
        questionQueue: [],
        currentTurnIndex: 0,
        players: game.players || [],
        spyId: null,
        word: null,
        askerId: null,
        targetId: null,
        askedTurns: [],
        ready: [],
        votes: {},
        result: null
    };
}

module.exports = {
    categories,
    publicGame,
    privateGameFor,
    addPlayer,
    removePlayer,
    setSettings,
    startGame,
    nextTurn,
    autoNextTurnIfNeeded,
    readyToVote,
    vote,
    spyGuess,
    resetGame
};