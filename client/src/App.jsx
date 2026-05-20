import { useEffect, useState } from "react";
import { socket } from "./socket";
import { setupDiscordUser } from "./discord";
import "./App.css";

const categories = [
  {
    id: "food",
    name: "أكل",
    words: ["بيتزا", "برجر", "شاورما", "سوشي", "مندي", "كبسة", "باستا"]
  },
  {
    id: "places",
    name: "أماكن",
    words: ["مدرسة", "مستشفى", "مطار", "مطعم", "سينما", "جامعة", "ملعب"]
  },
  {
    id: "games",
    name: "ألعاب",
    words: ["ماينكرافت", "فورتنايت", "فالورانت", "روبلوكس", "فيفا", "GTA"]
  }
];

function App() {
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [game, setGame] = useState(null);
  const [error, setError] = useState("");

  const isHost = !!game?.hostId && game.hostId === socket.id;
  const playersCount = game?.players?.length || 0;
  const currentCategory = categories.find(cat => cat.id === game?.category) || categories[0];

  useEffect(() => {
    socket.on("game:update", data => {
      setGame(data);
    });

    socket.on("game:startResult", res => {
      if (!res.ok) {
        if (res.error === "NEED_3_PLAYERS") {
          setError("لازم يكون عدد اللاعبين 3 أو أكثر");
        } else if (res.error === "ONLY_HOST") {
          setError("فقط الهوست يقدر يبدأ اللعبة");
        } else {
          setError("حدث خطأ أثناء بدء اللعبة");
        }
      } else {
        setError("");
      }
    });

    socket.on("connect", () => {
      console.log("Socket connected:", socket.id);
    });

    socket.on("connect_error", err => {
      setError("فشل الاتصال بالسيرفر: " + err.message);
    });

    async function loadDiscordUser() {
      try {
        const user = await setupDiscordUser();

        const discordName =
          user.global_name ||
          user.username ||
          "Player";

        setName(discordName);

        socket.emit("player:join", discordName);
        setJoined(true);
      } catch (err) {
        console.log("Discord SDK not available, using manual login");
      }
    }

    loadDiscordUser();

    return () => {
      socket.off("game:update");
      socket.off("game:startResult");
      socket.off("connect");
      socket.off("connect_error");
    };
  }, []);

  function joinGame() {
    if (!name.trim()) return;

    if (!socket.connected) {
      setError("السيرفر غير متصل، تأكد أن backend شغال على 3001");
      return;
    }

    socket.emit("player:join", name.trim());
    setJoined(true);
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

  if (!joined) {
    return (
      <div className="center-screen">
        <div className="auth-box">
          <h1 className="logo">برا السالفة</h1>

          <input
            placeholder="اسمك"
            value={name}
            onChange={e => setName(e.target.value)}
            className="input"
          />

          {error && <p className="error">{error}</p>}

          <button onClick={joinGame} className="button">
            دخول
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <h1>برا السالفة</h1>

      <div className="card">
        <h2>الحالة: {game?.state}</h2>
        <p>عدد اللاعبين: {playersCount}</p>
        <p>أنت: {isHost ? "الهوست" : "لاعب"}</p>
      </div>

      {isHost && game?.state === "LOBBY" && (
        <div className="card">
          <h3>اختيار التصنيف</h3>

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
            disabled={playersCount < 3}
            className="button"
          >
            بدء اللعبة
          </button>

          {playersCount < 3 && (
            <p className="error">تحتاج 3 لاعبين أو أكثر لبدء اللعبة</p>
          )}
        </div>
      )}

      {!isHost && game?.state === "LOBBY" && (
        <div className="card">
          <p>انتظر الهوست يختار التصنيف ويبدأ اللعبة</p>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <h3>اللاعبين</h3>

      <div className="players-grid">
        {game?.players?.map(player => (
          <div key={player.id} className="player-card">
            {player.name}
            {player.id === game.hostId && " 👑"}
          </div>
        ))}
      </div>

      {game?.state !== "LOBBY" && (
        <>
          {game?.state === "QUESTIONING" && (
            <div className="card">
              <h2>مرحلة الأسئلة</h2>

              <p>
                <strong>{game.players.find(p => p.id === game.askerId)?.name}</strong>
                {" يسأل "}
                <strong>{game.players.find(p => p.id === game.targetId)?.name}</strong>
              </p>

              <div className="progress">
                <div
                  className="progress-bar"
                  style={{
                    width: `${(game.timeLeft / game.timeLimit) * 100}%`
                  }}
                />
              </div>

              <div className="row">
                {isHost && (
                  <button
                    onClick={() => socket.emit("turn:next")}
                    className="button"
                  >
                    التالي
                  </button>
                )}

                <button
                  onClick={() => socket.emit("vote:ready")}
                  className="button green"
                >
                  جاهز للتصويت
                </button>
              </div>
            </div>
          )}

          {game?.state === "READY_TO_VOTE" && (
            <div className="card">
              <h2>بانتظار جميع اللاعبين...</h2>
              <p>جاهزين: {game.ready.length} / {game.players.length}</p>

              <button
                onClick={() => socket.emit("vote:ready")}
                className="button green"
              >
                أنا جاهز للتصويت
              </button>
            </div>
          )}

          {game?.state === "VOTING" && (
            <div className="card">
              <h2>التصويت</h2>
              <p>من هو برا السالفة؟</p>

              {game.players.map(player => (
                <button
                  key={player.id}
                  onClick={() => socket.emit("vote:cast", player.id)}
                  className="button"
                  style={{
                    marginBottom: 10,
                    width: "100%"
                  }}
                >
                  {player.name}
                </button>
              ))}
            </div>
          )}

          {game?.state === "SPY_GUESS" && game?.myRole === "SPY" && (
            <div className="card">
              <h2>تم كشفك!</h2>
              <p>اختر الكلمة الصحيحة:</p>

              {currentCategory.words.map(word => (
                <button
                  key={word}
                  onClick={() => socket.emit("spy:guess", word)}
                  className="button"
                  style={{
                    marginBottom: 10,
                    width: "100%"
                  }}
                >
                  {word}
                </button>
              ))}
            </div>
          )}

          {game?.state === "SPY_GUESS" && game?.myRole !== "SPY" && (
            <div className="card">
              <h2>تم كشف الجاسوس</h2>
              <p>ننتظر الجاسوس يحاول يخمن الكلمة...</p>
            </div>
          )}

          {game?.state === "RESULTS" && (
            <div className="card">
              <h2>النتيجة</h2>

              {game.result === "SPY_WINS" ? (
                <h3>الجاسوس فاز 😈</h3>
              ) : (
                <h3>اللاعبون فازوا 🎉</h3>
              )}

              {isHost && (
                <button
                  onClick={() => socket.emit("game:reset")}
                  className="button"
                >
                  جولة جديدة
                </button>
              )}
            </div>
          )}

          {game?.myRole === "SPY" ? (
            <div className="role-box spy">😈 أنت برا السالفة</div>
          ) : game?.myWord ? (
            <div className="role-box word">الكلمة: {game.myWord}</div>
          ) : null}
        </>
      )}
    </div>
  );
}

export default App;