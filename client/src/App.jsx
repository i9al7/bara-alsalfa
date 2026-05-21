import { useEffect, useState } from "react";
import { socket } from "./socket";
import { setupDiscordUser } from "./discord";
import "./App.css";

function App() {
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
  const allPlayersReady = playersCount >= 3 && lobbyReadyCount === playersCount;

  const currentCategory =
    categories.find(cat => cat.id === game?.category) || categories[0];

  useEffect(() => {
    fetch("/api/categories")
      .then(res => res.json())
      .then(data => {
        const formatted = Object.entries(data).map(([id, value]) => ({
          id,
          name: value.name,
          words: value.words
        }));
        setCategories(formatted);
      })
      .catch(() => setError("فشل تحميل التصنيفات"));

    socket.on("game:update", data => setGame(data));

    socket.on("lobby:joined", () => {
      setError("");
      setJoined(true);
    });

    socket.on("lobby:error", err => {
      setError(err === "INVALID_CODE" ? "كود الروم غير صحيح" : "حدث خطأ أثناء دخول الروم");
    });

    socket.on("game:startResult", res => {
      if (!res.ok) {
        if (res.error === "NEED_3_PLAYERS") setError("لازم يكون عدد اللاعبين 3 أو أكثر");
        else if (res.error === "ONLY_HOST") setError("فقط المضيف يقدر يبدأ اللعبة");
        else if (res.error === "PLAYERS_NOT_READY") setError("كل اللاعبين لازم يكونون جاهزين قبل بدء اللعبة");
        else setError("حدث خطأ أثناء بدء اللعبة");
      } else {
        setError("");
      }
    });

    socket.on("connect_error", err => {
      setError("فشل الاتصال بالسيرفر: " + err.message);
    });

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
        setError("افتح اللعبة من Discord Activity عشان يتم تسجيل دخولك تلقائيًا");
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
    if (!discordUser) return setError("لم يتم تحميل حساب Discord بعد");
    socket.emit("lobby:create", { user: discordUser });
  }

  function joinLobby() {
    if (!discordUser) return setError("لم يتم تحميل حساب Discord بعد");
    if (!joinCode.trim()) return setError("اكتب كود الروم");

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
      category,
      timeLimit: game?.timeLimit || 60
    });
  }

  if (loading) {
    return (
      <div className="loading-screen fade-in">
        <div className="loading-card scale-in">
          <div className="loading-logo">
            <img src="/bara-alsalfa-logo.png" alt="برا السالفة" />
          </div>
          <p>جاري تحميل اللعبة...</p>
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  if (!joined) {
    return (
      <div className="center-screen fade-in">
        <div className="auth-box scale-in">
          <h1 className="logo">برا السالفة</h1>

          {!discordUser && <p>جاري تحميل حساب Discord...</p>}

          {discordUser && !mode && (
            <div className="row slide-up">
              <button className="button" onClick={() => setMode("create")}>
                إنشاء روم
              </button>

              <button className="button green" onClick={() => setMode("join")}>
                دخول برمز
              </button>
            </div>
          )}

          {mode === "create" && (
            <div className="slide-up">
              <p>سيتم إنشاء روم باسم: {discordUser?.username}</p>

              <div className="row">
                <button className="button" onClick={createLobby}>
                  إنشاء الروم
                </button>

                <button className="button green" onClick={() => setMode(null)}>
                  رجوع
                </button>
              </div>
            </div>
          )}

          {mode === "join" && (
            <div className="slide-up">
              <input
                className="input"
                placeholder="كود الروم"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value)}
              />

              <div className="row">
                <button className="button green" onClick={joinLobby}>
                  دخول
                </button>

                <button className="button" onClick={() => setMode(null)}>
                  رجوع
                </button>
              </div>
            </div>
          )}

          {error && <p className="error slide-up">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="app fade-in">
      <h1 className="slide-up">برا السالفة</h1>

      <div className="card slide-up">
        <h2>الحالة: {game?.state}</h2>
        <p>
          كود الروم:
          <span className="room-code">{game?.roomCode || "—"}</span>
        </p>
        <p>عدد اللاعبين: {playersCount}</p>
        <p>الجاهزون: {lobbyReadyCount} / {playersCount}</p>
        <p>أنت: {isHost ? "المضيف" : "لاعب"}</p>
      </div>

      {game?.state === "LOBBY" && (
        <div className="card slide-up">
          <h3>جاهزية اللاعبين</h3>

          <button
            className={isLobbyReady ? "button" : "button green"}
            onClick={toggleLobbyReady}
          >
            {isLobbyReady ? "إلغاء الجاهزية" : "أنا جاهز"}
          </button>

          <p>
            لازم كل اللاعبين يكونون جاهزين قبل بدء اللعبة.
          </p>
        </div>
      )}

      {isHost && game?.state === "LOBBY" && (
        <div className="card slide-up">
          <h3>تحكم المضيف</h3>

          <select
            value={game?.category || "food"}
            onChange={e => changeCategory(e.target.value)}
            className="input"
          >
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>

          <button
            onClick={startGame}
            disabled={!allPlayersReady}
            className="button"
          >
            بدء اللعبة
          </button>

          {!allPlayersReady && (
            <p className="error">
              تحتاج 3 لاعبين أو أكثر، وكل اللاعبين لازم يكونون جاهزين.
            </p>
          )}
        </div>
      )}

      {!isHost && game?.state === "LOBBY" && (
        <div className="card slide-up">
          <p>انتظر المضيف يختار التصنيف ويبدأ اللعبة</p>
        </div>
      )}

      {error && <p className="error slide-up">{error}</p>}

      <h3 className="slide-up">اللاعبين</h3>

      <div className="players-grid">
        {game?.players?.map(player => {
          const ready = game?.lobbyReady?.includes(player.id);

          return (
            <div key={player.id} className="player-card scale-in">
              <img
                className="avatar"
                src={
                  player.avatar
                    ? `https://cdn.discordapp.com/avatars/${player.discordId}/${player.avatar}.png`
                    : "https://cdn.discordapp.com/embed/avatars/0.png"
                }
                alt={player.name}
              />

              <span>{player.name}</span>

              {game?.state === "LOBBY" && (
                <div className={ready ? "ready-badge" : "not-ready-badge"}>
                  {ready ? "جاهز" : "غير جاهز"}
                </div>
              )}

              {player.id === game.hostId && (
                <div className="host-badge">
                  <svg viewBox="0 0 24 24" fill="none" className="host-icon">
                    <path
                      d="M5 18L3 7L8 10L12 4L16 10L21 7L19 18H5Z"
                      fill="currentColor"
                    />
                    <path
                      d="M7 21H17"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span>مضيف</span>
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
              <h2>مرحلة الأسئلة</h2>

              <div className="question-turn">
                <div className="turn-player asker scale-in">
                  <span className="turn-label">السائل</span>
                  <strong>{game.currentAsker?.name}</strong>
                </div>

                <div className="turn-arrow">يسأل</div>

                <div className="turn-player target scale-in">
                  <span className="turn-label">المجيب</span>
                  <strong>{game.currentTarget?.name}</strong>
                </div>
              </div>

              <div className="progress">
                <div
                  key={game.currentTurnIndex}
                  className={`progress-bar ${game.timeLeft <= 10 ? "danger-bar" : ""}`}
                  style={{
                    width: `${(game.timeLeft / game.timeLimit) * 100}%`
                  }}
                />
              </div>

              <div className={`timer-text ${game.timeLeft <= 10 ? "timer-danger" : ""}`}>
                {game.timeLeft}s
              </div>

              <div className="row">
                {isHost && (
                  <button onClick={() => socket.emit("turn:next")} className="button">
                    التالي
                  </button>
                )}

                <button onClick={() => socket.emit("vote:ready")} className="button green">
                  جاهز للتصويت
                </button>
              </div>
            </div>
          )}

          {game?.state === "READY_TO_VOTE" && (
            <div className="card scale-in">
              <h2>بانتظار جميع اللاعبين...</h2>
              <p>جاهزين: {game.ready.length} / {game.players.length}</p>

              <button onClick={() => socket.emit("vote:ready")} className="button green">
                أنا جاهز للتصويت
              </button>
            </div>
          )}

          {game?.state === "VOTING" && (
            <div className="card scale-in">
              <h2>التصويت</h2>
              <p>من هو برا السالفة؟</p>

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
              <h2>تم كشفك!</h2>
              <p>اختر الكلمة الصحيحة:</p>

              {currentCategory?.words?.map(word => (
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
              <h2>تم كشف الجاسوس</h2>
              <p>ننتظر الجاسوس يحاول يخمن الكلمة...</p>
            </div>
          )}

          {game?.state === "RESULTS" && (
            <div className="card scale-in">
              <h2>النتيجة</h2>

              {game.result === "SPY_WINS" ? (
                <h3 className="result-title spy-win">
                  <svg className="result-icon" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 3L4 7V12C4 17 7.5 21 12 22C16.5 21 20 17 20 12V7L12 3Z"
                      fill="currentColor"
                    />
                    <path
                      d="M9 12L11 14L15 10"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>الجاسوس فاز</span>
                </h3>
              ) : game.result === "DRAW" ? (
                <h3 className="result-title draw-result">
                  <svg className="result-icon" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M8 12H16"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                    />
                    <path
                      d="M12 8V16"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                    />
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                  </svg>
                  <span>تعادل</span>
                </h3>
              ) : (
                <h3 className="result-title players-win">
                  <svg className="result-icon" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 2L15 8L22 9L17 14L18 21L12 18L6 21L7 14L2 9L9 8L12 2Z"
                      fill="currentColor"
                    />
                  </svg>
                  <span>اللاعبون فازوا</span>
                </h3>
              )}

              <p>الكلمة كانت: {game.word}</p>

              {isHost && (
                <button onClick={() => socket.emit("game:reset")} className="button">
                  جولة جديدة
                </button>
              )}
            </div>
          )}

          {game?.myRole === "SPY" ? (
            <div className="role-box spy reveal-pop">
              <svg className="spy-icon" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 3L4 7V12C4 17 7.5 21 12 22C16.5 21 20 17 20 12V7L12 3Z"
                  fill="currentColor"
                />
                <path
                  d="M9 12L11 14L15 10"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>

              <span>أنت برا السالفة</span>
            </div>
          ) : game?.myWord ? (
            <div className="role-box word reveal-pop">
              الكلمة: {game.myWord}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export default App;