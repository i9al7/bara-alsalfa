import { DiscordSDK } from "@discord/embedded-app-sdk";

const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;

export const discordSdk = new DiscordSDK(clientId);

export async function setupDiscord() {
    await discordSdk.ready();

    const { code } = await discordSdk.commands.authorize({
        client_id: clientId,
        response_type: "code",
        state: "",
        prompt: "none",
        scope: ["identify"]
    });

    return code;
}