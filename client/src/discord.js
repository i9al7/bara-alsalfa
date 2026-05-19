import { DiscordSDK } from "@discord/embedded-app-sdk";

const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;

export const discordSdk = new DiscordSDK(clientId);

export async function getDiscordUser() {
    await discordSdk.ready();

    const user = await discordSdk.commands.getInstanceConnectedParticipants();

    return user;
}