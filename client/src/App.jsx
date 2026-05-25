  import { useEffect, useState } from "react";
  import { socket } from "./socket";
  import { setupDiscordUser } from "./discord";
  import { translations } from "./lang";
  import "./App.css";
  
  function App() {
    const [lang, setLang] = useState("ar");
    const t = translations[lang];
  
    const [joined, setJoined] = useState(false);
    const [game, setGame] = useState(null);
    const [error, setError] = useState("");
    const [discordUser, setDiscordUser] = useState(null);
    const [joinCode, setJoinCode] = useState("");
    const [mode, setMode] = useState(null);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
  
    const [tickSound] = useState(() => new Audio("/sounds/tick.mp3"));
    const [endSound] = useState(() => new Audio("/sounds/end.mp3"));
  
    const isHost = !!game?.hostId && game.hostId === socket.id;
    const playersCount = game?.players?.length || 0;
    const lobbyReadyCount = game?.lobbyReady?.length || 0;
    const isLobbyReady = game?.lobbyReady?.includes(socket.id);
    const MIN_PLAYERS = 1;

const allPlayersReady =
  playersCount >= MIN_PLAYERS &&
  lobbyReadyCount === playersCount;
    //const allPlayersReady = playersCount >= 3 && lobbyReadyCount === playersCount;
    const currentCategory = categories.find(cat => cat.id === game?.category) || categories[0];
  
    useEffect(() => {
      fetch("/api/categories")
        .then(res => res.json())
        .then(data => {
          setCategories(
            Object.entries(data).map(([id, value]) => ({
              id,
              name: value.name,
              words: value.words
            }))
          );
        })
        .catch(() => setError(t.failedCategories));
  
      socket.on("game:update", data => setGame(data));
      socket.on("lobby:joined", () => {
        setError("");
        setJoined(true);
      });
  
      socket.on("lobby:error", err => {
        setError(err === "INVALID_CODE" ? t.invalidCode : t.joinError);
      });
  
      socket.on("game:startResult", res => {
        if (!res.ok) {
          if (res.error === "NEED_3_PLAYERS") setError(t.needPlayers);
          else if (res.error === "ONLY_HOST") setError(t.onlyHost);
          else if (res.error === "PLAYERS_NOT_READY") setError(t.playersNotReady);
          else setError(t.startError);
        } else {
          setError("");
        }
      });
  
      socket.on("connect_error", err => setError(`${t.serverError}: ${err.message}`));
  
      async function loadDiscordUser() {
        try {
          const user = await setupDiscordUser();
          const discordName = user.global_name || user.username || "Player";
  
          setDiscordUser({
            id: user.id,
            username: discordName,
            avatar: user.avatar
          });
        } catch {
          setError(t.openInDiscord);
        } finally {
          setLoading(false);
        }
      }
  
      loadDiscordUser();
  
      return () => {
        socket.off("game:update");
        socket.off("lobby:joined");
        socket.off("lobby:error");
        socket.off("game:startResult");
        socket.off("connect_error");
      };
    }, []);
  
    useEffect(() => {
      if (!game) return;
  
      if (game.state !== "QUESTIONING") {
        tickSound.pause();
        tickSound.currentTime = 0;
        return;
      }
  
      if (game.timeLeft <= 10 && game.timeLeft > 0) {
        if (tickSound.paused) {
          tickSound.volume = 0.12;
          tickSound.play().catch(() => { });
        }
      } else {
        tickSound.pause();
        tickSound.currentTime = 0;
      }
  
      if (game.timeLeft === 0) {
        tickSound.pause();
        tickSound.currentTime = 0;
        endSound.volume = 0.22;
        endSound.currentTime = 0;
        endSound.play().catch(() => { });
      }
    }, [game?.timeLeft, game?.state, tickSound, endSound]);
  
    useEffect(() => {
      return () => {
        tickSound.pause();
        tickSound.currentTime = 0;
        endSound.pause();
        endSound.currentTime = 0;
      };
    }, [tickSound, endSound]);
  
    function createLobby() {
      if (!discordUser) return setError(t.discordNotLoaded);
      socket.emit("lobby:create", { user: discordUser });
    }
  
    function joinLobby() {
      if (!discordUser) return setError(t.discordNotLoaded);
      if (!joinCode.trim()) return setError(t.enterCode);
  
      socket.emit("lobby:join", {
        code: joinCode.trim().toUpperCase(),
        user: discordUser
      });
    }
  
    function toggleLobbyReady() {
      socket.emit("lobby:ready");
    }
  
    function startGame() {
      setError("");
      socket.emit("game:start");
    }
  
    function changeCategory(category) {
      socket.emit("host:settings", {
        category: game?.category || "food",
        lang,
        timeLimit: Number(e.target.value)
      });
    }
    
    function changeLang(nextLang) {
  setLang(nextLang);

  if (isHost && game?.state === "LOBBY") {
    socket.emit("host:settings", {
      category: game?.category || "food",
      lang: nextLang,
      timeLimit: game?.timeLimit || 60
    });
  }
}
  
    if (loading) {
      return (
        <div className="loading-screen fade-in" dir={lang === "ar" ? "rtl" : "ltr"}>
          <div className="loading-card scale-in">
            <div className="loading-logo">
              <img src="/bara-alsalfa-logo.png" alt={t.title} />
            </div>
            <p>{t.loading}</p>
            <div className="loading-spinner" />
          </div>
        </div>
      );
    }
  
    if (!joined) {
      return (
        <div className="center-screen fade-in" dir={lang === "ar" ? "rtl" : "ltr"}>
          <div className="auth-box scale-in">
            <div className="lang-switch">
              <button className={lang === "ar" ? "active-lang" : ""} onClick={() => changeLang("ar")}>عربي</button>
              <button className={lang === "en" ? "active-lang" : ""} onClick={() => changeLang("en")}>English</button>
            </div>
  
            <h1 className="logo">{t.title}</h1>
  
            {!discordUser && <p>{t.loadingDiscord}</p>}
  
            {discordUser && !mode && (
              <div className="row slide-up">
                <button className="button" onClick={() => setMode("create")}>{t.createRoom}</button>
                <button className="button green" onClick={() => setMode("join")}>{t.joinRoom}</button>
              </div>
            )}
  
            {mode === "create" && (
              <div className="slide-up">
                <p>{t.createAs}: {discordUser?.username}</p>
                <div className="row">
                  <button className="button" onClick={createLobby}>{t.createRoom}</button>
                  <button className="button green" onClick={() => setMode(null)}>{t.back}</button>
                </div>
              </div>
            )}
  
            {mode === "join" && (
              <div className="slide-up">
                <input
                  className="input"
                  placeholder={t.roomCode}
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value)}
                />
  
                <div className="row">
                  <button className="button green" onClick={joinLobby}>{t.join}</button>
                  <button className="button" onClick={() => setMode(null)}>{t.back}</button>
                </div>
              </div>
            )}
  
            {error && <p className="error slide-up">{error}</p>}
          </div>
        </div>
      );
    }
  
    return (
      <div className="app fade-in" dir={lang === "ar" ? "rtl" : "ltr"}>
        <div className="lang-switch">
          <button className={lang === "ar" ? "active-lang" : ""} onClick={() => setLang("ar")}>عربي</button>
          <button className={lang === "en" ? "active-lang" : ""} onClick={() => setLang("en")}>English</button>
        </div>
  
        <h1 className="slide-up">{t.title}</h1>
  
        <div className="card slide-up">
          <h2>{t.status}: {game?.state}</h2>
          <p>{t.roomCode}: <span className="room-code">{game?.roomCode || "—"}</span></p>
          <p>{t.players}: {playersCount}</p>
          <p>{t.readyPlayers}: {lobbyReadyCount} / {playersCount}</p>
          <p>{t.youAre}: {isHost ? t.host : t.player}</p>
        </div>
  
        {game?.state === "LOBBY" && (
          <div className="card slide-up">
            <h3>{t.readyCheck}</h3>
            <button className={isLobbyReady ? "button" : "button green"} onClick={toggleLobbyReady}>
              {isLobbyReady ? t.unreadyButton : t.readyButton}
            </button>
            <p>{t.readyHint}</p>
          </div>
        )}
  
        {isHost && game?.state === "LOBBY" && (
          <div className="card host-controls slide-up">
            <div className="host-controls-header">
              <h3>{t.hostControls}</h3>
              <span className="host-status">{t.host}</span>
            </div>
  
            <label className="field-label">{t.category}</label>
            <select value={game?.category || "food"} onChange={e => changeCategory(e.target.value)} className="input">
              {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name?.[lang] || cat.name}</option>)}
            </select>
  
            <label className="field-label">{t.questionTime}</label>
            <select
              value={game?.timeLimit || 60}
              onChange={e => socket.emit("host:settings", {
                category: game?.category || "food",
                timeLimit: Number(e.target.value)
              })}
              className="input"
            >
              {[30, 45, 60, 90, 120].map(sec => (
                <option key={sec} value={sec}>{sec} {t.seconds}</option>
              ))}
            </select>
  
            <div className="host-info">
              <span>{t.players}: {playersCount}</span>
              <span>{t.readyPlayers}: {lobbyReadyCount} / {playersCount}</span>
            </div>
  
            <button onClick={startGame} disabled={!allPlayersReady} className="button start-button">
              {t.startGame}
            </button>
  
            {!allPlayersReady && <p className="error">{t.needReadyAll}</p>}
          </div>
        )}
  
        {!isHost && game?.state === "LOBBY" && (
          <div className="card slide-up">
            <p>{t.waitingHost}</p>
          </div>
        )}
  
        {error && <p className="error slide-up">{error}</p>}
  
        <h3 className="slide-up">{t.playersList}</h3>
  
        <div className="players-grid">
          {game?.players?.map(player => {
            const ready = game?.lobbyReady?.includes(player.id);
  
            return (
              <div key={player.id} className="player-card scale-in">
                <img
                  className="avatar"
                  src={player.avatar ? `https://cdn.discordapp.com/avatars/${player.discordId}/${player.avatar}.png` : "https://cdn.discordapp.com/embed/avatars/0.png"}
                  alt={player.name}
                />
  
                <span>{player.name}</span>
  
                {game?.state === "LOBBY" && (
                  <div className={ready ? "ready-badge" : "not-ready-badge"}>
                    {ready ? t.ready : t.notReady}
                  </div>
                )}
  
                {player.id === game.hostId && (
                  <div className="host-badge">
                    <span>{t.host}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
  
        {game?.state !== "LOBBY" && (
          <>
            {game?.state === "QUESTIONING" && (
              <div className="card slide-up">
                <h2>{t.questioning}</h2>
  
                <div className="question-turn">
                  <div className="turn-player asker scale-in">
                    <span className="turn-label">{t.asker}</span>
                    <strong>{game.currentAsker?.name}</strong>
                  </div>
  
                  <div className="turn-arrow">{t.asks}</div>
  
                  <div className="turn-player target scale-in">
                    <span className="turn-label">{t.answerer}</span>
                    <strong>{game.currentTarget?.name}</strong>
                  </div>
                </div>
  
                <div className="progress">
                  <div
                    key={game.currentTurnIndex}
                    className={`progress-bar ${game.timeLeft <= 10 ? "danger-bar" : ""}`}
                    style={{ width: `${(game.timeLeft / game.timeLimit) * 100}%` }}
                  />
                </div>
  
                <div className={`timer-text ${game.timeLeft <= 10 ? "timer-danger" : ""}`}>
                  {game.timeLeft}s
                </div>
  
                <div className="row">
                  {isHost && <button onClick={() => socket.emit("turn:next")} className="button">{t.next}</button>}
                  <button onClick={() => socket.emit("vote:ready")} className="button green">{t.readyToVote}</button>
                </div>
              </div>
            )}
  
            {game?.state === "READY_TO_VOTE" && (
              <div className="card scale-in">
                <h2>{t.waitingPlayers}</h2>
                <p>{t.readyPlayers}: {game.ready.length} / {game.players.length}</p>
                <button onClick={() => socket.emit("vote:ready")} className="button green">{t.readyToVote}</button>
              </div>
            )}
  
            {game?.state === "VOTING" && (
              <div className="card scale-in">
                <h2>{t.voting}</h2>
                <p>{t.whoIsSpy}</p>
  
                {game.players.map(player => (
                  <button
                    key={player.id}
                    onClick={() => socket.emit("vote:cast", player.id)}
                    className="button"
                    style={{ marginBottom: 10, width: "100%" }}
                  >
                    {player.name}
                  </button>
                ))}
              </div>
            )}
  
            {game?.state === "SPY_GUESS" && game?.myRole === "SPY" && (
              <div className="card scale-in">
                <h2>{t.youWereCaught}</h2>
                <p>{t.chooseWord}</p>
  
                {(currentCategory?.words?.[lang] || currentCategory?.words || []).map(word => (
                  <button
                    key={word}
                    onClick={() => socket.emit("spy:guess", word)}
                    className="button"
                    style={{ marginBottom: 10, width: "100%" }}
                  >
                    {word}
                  </button>
                ))}
              </div>
            )}
  
            {game?.state === "SPY_GUESS" && game?.myRole !== "SPY" && (
              <div className="card scale-in">
                <h2>{t.spyCaught}</h2>
                <p>{t.waitSpyGuess}</p>
              </div>
            )}
  
            {game?.state === "RESULTS" && (
              <div className="card scale-in">
                <h2>{t.results}</h2>
  
                {game.result === "SPY_WINS" ? (
                  <h3 className="result-title spy-win">{t.spyWon}</h3>
                ) : game.result === "DRAW" ? (
                  <h3 className="result-title draw-result">{t.draw}</h3>
                ) : (
                  <h3 className="result-title players-win">{t.playersWon}</h3>
                )}
  
                <p>{t.wordWas}: {game.word}</p>
  
                {isHost && (
                  <button onClick={() => socket.emit("game:reset")} className="button">
                    {t.newRound}
                  </button>
                )}
              </div>
            )}
  
            {game?.myRole === "SPY" ? (
              <div className="role-box spy reveal-pop">
                <span>{t.youAreSpy}</span>
              </div>
            ) : game?.myWord ? (
              <div className="role-box word reveal-pop">
                {t.word}: {game.myWord}
              </div>
            ) : null}
          </>
        )}
      </div>
    );
  }
  
  export default App;