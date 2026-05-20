import { useEffect, useState } from "react";
import { socket } from "./socket";
import { setupDiscordUser } from "./discord";
import "./App.css";

// const categories = [
//   { id: "food", name: "أكل", words: ["بيتزا", "برجر", "شاورما", "سوشي", "مندي", "كبسة", "باستا"] },
//   { id: "places", name: "أماكن", words: ["مدرسة", "مستشفى", "مطار", "مطعم", "سينما", "جامعة", "ملعب"] },
//   { id: "games", name: "ألعاب", words: ["ماينكرافت", "فورتنايت", "فالورانت", "روبلوكس", "فيفا", "GTA"] }
// ];

function App() {
  const [joined, setJoined] = useState(false);
  const [game, setGame] = useState(null);
  const [error, setError] = useState("");
  const [discordUser, setDiscordUser] = useState(null);
  const [joinCode, setJoinCode] = useState("");
  const [mode, setMode] = useState(null);
  const [categories, setCategories] = useState([]);

  const isHost = !!game?.hostId && game.hostId === socket.id;
  const playersCount = game?.players?.length || 0;
  const currentCategory = categories.find(cat => cat.id === game?.category) || categories[0];

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
      .catch(() => {
        setError("فشل تحميل التصنيفات");
      });

    socket.on("game:update", data => setGame(data));

    socket.on("lobby:joined", () => {
      setError("");
      setJoined(true);
    });

    socket.on("lobby:error", err => {
      if (err === "INVALID_CODE") setError("كود الروم غير صحيح");
      else setError("حدث خطأ أثناء دخول الروم");
    });

    socket.on("game:startResult", res => {
      if (!res.ok) {
        if (res.error === "NEED_3_PLAYERS") setError("لازم يكون عدد اللاعبين 3 أو أكثر");
        else if (res.error === "ONLY_HOST") setError("فقط الهوست يقدر يبدأ اللعبة");
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

  function createLobby() {
    if (!discordUser) {
      setError("لم يتم تحميل حساب Discord بعد");
      return;
    }

    socket.emit("lobby:create", {
      user: discordUser
    });
  }

  function joinLobby() {
    if (!discordUser) {
      setError("لم يتم تحميل حساب Discord بعد");
      return;
    }

    if (!joinCode.trim()) {
      setError("اكتب كود الروم");
      return;
    }

    socket.emit("lobby:join", {
      code: joinCode.trim().toUpperCase(),
      user: discordUser
    });
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

          {!discordUser && (
            <p>جاري تحميل حساب Discord...</p>
          )}

          {discordUser && !mode && (
            <div className="row">
              <button className="button" onClick={() => setMode("create")}>
                إنشاء روم
              </button>

              <button className="button green" onClick={() => setMode("join")}>
                دخول برمز
              </button>
            </div>
          )}

          {mode === "create" && (
            <>
              <p>سيتم إنشاء روم باسم: {discordUser?.username}</p>

              <button className="button" onClick={createLobby}>
                إنشاء الروم
              </button>

              <button className="button green" onClick={() => setMode(null)}>
                رجوع
              </button>
            </>
          )}

          {mode === "join" && (
            <>
              <input
                className="input"
                placeholder="كود الروم"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value)}
              />

              <button className="button green" onClick={joinLobby}>
                دخول
              </button>

              <button className="button" onClick={() => setMode(null)}>
                رجوع
              </button>
            </>
          )}

          {error && <p className="error">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <h1>برا السالفة</h1>

      <div className="card">
        <h2>الحالة: {game?.state}</h2>
        <p>كود الروم: {game?.roomCode || "—"}</p>
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
            <img
              className="avatar"
              src={
                player.avatar
                  ? `https://cdn.discordapp.com/avatars/${player.discordId}/${player.avatar}.png`
                  : "https://cdn.discordapp.com/embed/avatars/0.png"
              }
            />
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
                <strong>{game.currentAsker?.name}</strong>
                {" يسأل "}
                <strong>{game.currentTarget?.name}</strong>
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
                  <button onClick={() => socket.emit("turn:next")} className="button">
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
                  style={{ marginBottom: 10, width: "100%" }}
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
                  style={{ marginBottom: 10, width: "100%" }}
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
              ) : game.result === "DRAW" ? (
                <h3>تعادل 🤝</h3>
              ) : (
                <h3>اللاعبون فازوا 🎉</h3>
              )}

              <p>الكلمة كانت: {game.word}</p>

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