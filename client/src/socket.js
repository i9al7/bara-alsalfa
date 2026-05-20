import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.PROD
    ? window.location.origin
    : "http://localhost:3001";

export const socket = io(SERVER_URL, {
    transports: ["websocket"]
});