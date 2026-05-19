const categories = require("./words");

let game = {
    state: "LOBBY",
    hostId: null,
    category: "food",
    timeLimit: 60,
    turnStartedAt: null,
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
        word: null,
        spyId: null,
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
    const players = game.players;

    if (game.askedTurns.length >= players.length) {
        game.state = "READY_TO_VOTE";
        game.turnStartedAt = null;
        return;
    }

    let asker;

    if (!game.askerId) {
        asker = randomItem(players);
    } else {
        asker = players.find(p => p.id === game.targetId);
    }

    if (!asker) {
        asker = randomItem(players);
    }

    const possibleTargets = players.filter(p =>
        p.id !== asker.id &&
        !game.askedTurns.some(t => t.askerId === asker.id && t.targetId === p.id)
    );

    const target = possibleTargets.length
        ? randomItem(possibleTargets)
        : randomItem(players.filter(p => p.id !== asker.id));

    game.askerId = asker.id;
    game.targetId = target.id;
    game.askedTurns.push({ askerId: asker.id, targetId: target.id });
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
    if (game.state !== "VOTING") return;

    game.votes[voterId] = targetId;

    if (Object.keys(game.votes).length === game.players.length) {
        finishVoting();
    }
}

function finishVoting() {
    const counts = {};

    Object.values(game.votes).forEach(id => {
        counts[id] = (counts[id] || 0) + 1;
    });

    const votedPlayerId = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])[0][0];

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

function resetGame() {
    game = {
        state: "LOBBY",
        hostId: game.hostId,
        category: "food",
        timeLimit: 60,
        turnStartedAt: null,
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