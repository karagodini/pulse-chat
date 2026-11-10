import { ClientEvent } from '@pulse/shared';
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function connectSocket(token: string) {
  if (socket) {
    socket.auth = { token };
    if (!socket.connected) socket.connect();
    return socket;
  }
  socket = io({
    path: '/socket.io',
    transports: ['websocket'],
    auth: { token },
  });
  return socket;
}

export function getSocket() {
  return socket;
}

export function updateSocketAuth(token: string) {
  if (!socket) return;
  socket.auth = { token };
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export function emitTyping(channelId: string, active: boolean) {
  socket?.emit(active ? ClientEvent.typingStart : ClientEvent.typingStop, { channelId });
}

export function joinChannel(channelId: string) {
  socket?.emit(ClientEvent.roomJoin, { channelId });
}
