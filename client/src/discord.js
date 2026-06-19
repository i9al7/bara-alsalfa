import { DiscordSDK } from "@discord/embedded-app-sdk";

const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;

const serverUrl = import.meta.env.PROD
  ? window.location.origin
  : "http://localhost:3001";

let discordSdk = null;

export async function setupDiscordUser() {
  if (!clientId) throw new Error("Missing VITE_DISCORD_CLIENT_ID");

  try {
    discordSdk = new DiscordSDK(clientId);

    await discordSdk.ready();

    console.log("Discord Ready");

    const { code } = await discordSdk.commands.authorize({
      client_id: clientId,
      response_type: "code",
      state: "",
      prompt: "none",
      scope: ["identify"]
    });

    console.log("Code:", code);

    const tokenRes = await fetch(`${serverUrl}/api/discord/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ code })
    });

    console.log("Token Response:", tokenRes.status);

    const data = await tokenRes.json();

    console.log("Token Data:", data);

    const auth = await discordSdk.commands.authenticate({
      access_token: data.access_token
    });

    console.log("Authenticated User:", auth.user);

    return auth.user;

  } catch (err) {
    console.error("DISCORD LOGIN ERROR:", err);

    return {
      id: "local-user-1",
      username: "Local Tester",
      avatar: null
    };
  }
}