import { DiscordSDK } from "@discord/embedded-app-sdk";

const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;

const serverUrl = import.meta.env.PROD
  ? window.location.origin
  : "http://localhost:3001";

let discordSdk = null;

function isDiscordActivity() {
  try {
    return window.parent !== window;
  } catch {
    return false;
  }
}

export async function setupDiscordUser() {
  if (!clientId) throw new Error("Missing VITE_DISCORD_CLIENT_ID");

  if (!isDiscordActivity()) {
    throw new Error("Not running inside Discord Activity");
  }

  discordSdk = new DiscordSDK(clientId);

  await discordSdk.ready();

  const { code } = await discordSdk.commands.authorize({
    client_id: clientId,
    response_type: "code",
    state: "",
    prompt: "none",
    scope: ["identify"]
  });

  const tokenRes = await fetch(`${serverUrl}/api/discord/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code })
  });

  if (!tokenRes.ok) {
    throw new Error("Failed to exchange Discord code");
  }

  const data = await tokenRes.json();

  const auth = await discordSdk.commands.authenticate({
    access_token: data.access_token
  });

  return auth.user;
}