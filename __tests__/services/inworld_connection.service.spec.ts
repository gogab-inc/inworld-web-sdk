import '../mocks/window.mock';

import { v4 } from 'uuid';

import { DataChunkDataType } from '../../proto/packets.pb';
import { InworldHistory } from '../../src/components/history';
import { GrpcAudioPlayback } from '../../src/components/sound/grpc_audio.playback';
import { GrpcAudioRecorder } from '../../src/components/sound/grpc_audio.recorder';
import { GrpcWebRtcLoopbackBiDiSession } from '../../src/components/sound/grpc_web_rtc_loopback_bidi.session';
import { WebSocketConnection } from '../../src/connection/web-socket.connection';
import {
  InworldPacket,
  InworldPacketType,
  PacketId,
  Routing,
} from '../../src/entities/inworld_packet.entity';
import { EventFactory } from '../../src/factories/event';
import { ConnectionService } from '../../src/services/connection.service';
import { InworldConnectionService } from '../../src/services/inworld_connection.service';
import { createCharacter, generateSessionToken, writeMock } from '../helpers';

const characters = [createCharacter(), createCharacter()];
const eventFactory = new EventFactory();
const grpcAudioPlayer = new GrpcAudioPlayback();
const grpcAudioRecorder = new GrpcAudioRecorder();
const webRtcLoopbackBiDiSession = new GrpcWebRtcLoopbackBiDiSession();
const onHistoryChange = jest.fn();

const connection = new ConnectionService({
  grpcAudioPlayer,
  webRtcLoopbackBiDiSession,
  generateSessionToken,
  onHistoryChange,
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('should open connection', async () => {
  const service = new InworldConnectionService({
    connection,
    grpcAudioPlayer,
    grpcAudioRecorder,
    webRtcLoopbackBiDiSession,
  });
  const open = jest
    .spyOn(ConnectionService.prototype, 'openManually')
    .mockImplementationOnce(jest.fn());

  await service.open();

  expect(open).toHaveBeenCalledTimes(1);
});

test('should return active state', () => {
  const service = new InworldConnectionService({
    connection,
    grpcAudioPlayer,
    grpcAudioRecorder,
    webRtcLoopbackBiDiSession,
  });

  jest
    .spyOn(ConnectionService.prototype, 'isActive')
    .mockImplementationOnce(() => true);

  expect(service.isActive()).toEqual(true);
});

test('close', () => {
  const service = new InworldConnectionService({
    connection,
    grpcAudioPlayer,
    grpcAudioRecorder,
    webRtcLoopbackBiDiSession,
  });
  const close = jest
    .spyOn(connection, 'close')
    .mockImplementationOnce(jest.fn());
  service.close();

  expect(close).toHaveBeenCalledTimes(1);
});

describe('character', () => {
  let service: InworldConnectionService;

  beforeEach(() => {
    jest.clearAllMocks();

    jest
      .spyOn(ConnectionService.prototype, 'getCharactersList')
      .mockImplementation(() => Promise.resolve(characters));
    jest
      .spyOn(ConnectionService.prototype, 'getEventFactory')
      .mockImplementation(() => eventFactory);

    service = new InworldConnectionService({
      connection,
      grpcAudioPlayer,
      grpcAudioRecorder,
      webRtcLoopbackBiDiSession,
    });
  });

  test('should return characters', async () => {
    const result = await service.getCharacters();

    expect(result).toEqual(characters);
  });

  test('should return current character', async () => {
    const getCurrentCharacter = jest
      .spyOn(eventFactory, 'getCurrentCharacter')
      .mockImplementationOnce(() => characters[0]);

    const result = await service.getCurrentCharacter();

    expect(result).toEqual(characters[0]);
    expect(getCurrentCharacter).toHaveBeenCalledTimes(1);
  });

  test('should set current character', async () => {
    const setCurrentCharacter = jest.spyOn(eventFactory, 'setCurrentCharacter');

    service.setCurrentCharacter(characters[0]);

    expect(setCurrentCharacter).toHaveBeenCalledTimes(1);
    expect(setCurrentCharacter).toHaveBeenCalledWith(characters[0]);
  });
});

describe('history', () => {
  let service: InworldConnectionService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new InworldConnectionService({
      connection,
      grpcAudioPlayer,
      grpcAudioRecorder,
      webRtcLoopbackBiDiSession,
    });
  });

  test('should get history', () => {
    const history = new InworldHistory();
    const packetId: PacketId = {
      packetId: v4(),
      interactionId: v4(),
      utteranceId: v4(),
    };
    const routing: Routing = {
      source: {
        name: v4(),
        isPlayer: true,
        isCharacter: false,
      },
      target: {
        name: characters[0].getId(),
        isPlayer: false,
        isCharacter: true,
      },
    };
    const date = new Date().toISOString();
    const packet = new InworldPacket({
      packetId,
      routing,
      date,
      text: {
        text: v4(),
        final: false,
      },
      type: InworldPacketType.TEXT,
    });
    history.addOrUpdate({ characters, grpcAudioPlayer, packet });

    const getHistory = jest
      .spyOn(ConnectionService.prototype, 'getHistory')
      .mockImplementationOnce(() => history.get());

    expect(service.getHistory()).toEqual(history.get());
    expect(getHistory).toHaveBeenCalledTimes(1);
  });

  test('should clear history', () => {
    const clearHistory = jest
      .spyOn(ConnectionService.prototype, 'clearHistory')
      .mockImplementationOnce(jest.fn);

    service.clearHistory();

    expect(clearHistory).toHaveBeenCalledTimes(1);
  });
});

describe('send', () => {
  let service: InworldConnectionService;

  const open = jest
    .spyOn(ConnectionService.prototype, 'open')
    .mockImplementationOnce(jest.fn());

  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .spyOn(ConnectionService.prototype, 'isActive')
      .mockImplementation(() => true);
    jest
      .spyOn(ConnectionService.prototype, 'getEventFactory')
      .mockImplementation(() => eventFactory);
    jest
      .spyOn(grpcAudioPlayer, 'excludeCurrentInteractionPackets')
      .mockImplementation(() => []);
    service = new InworldConnectionService({
      connection,
      grpcAudioPlayer,
      grpcAudioRecorder,
      webRtcLoopbackBiDiSession,
    });
  });

  test('should send audio', async () => {
    const write = jest
      .spyOn(WebSocketConnection.prototype, 'write')
      .mockImplementationOnce(writeMock);

    const chunk = v4();

    const packet = await service.sendAudio(chunk);

    expect(open).toHaveBeenCalledTimes(0);
    expect(write).toHaveBeenCalledTimes(1);
    expect(packet).toHaveProperty('type', DataChunkDataType.AUDIO);
    expect(packet.audio).toHaveProperty('chunk', chunk);
  });

  test('should send text', async () => {
    const write = jest
      .spyOn(WebSocketConnection.prototype, 'write')
      .mockImplementationOnce(writeMock);

    const text = v4();

    const packet = await service.sendText(text);

    expect(open).toHaveBeenCalledTimes(0);
    expect(write).toHaveBeenCalledTimes(1);
    expect(packet.text).toHaveProperty('text', text);
  });

  test('should send trigger', async () => {
    const write = jest
      .spyOn(WebSocketConnection.prototype, 'write')
      .mockImplementationOnce(writeMock);

    const name = v4();

    const packet = await service.sendTrigger(name);

    expect(open).toHaveBeenCalledTimes(0);
    expect(write).toHaveBeenCalledTimes(1);
    expect(packet.trigger).toHaveProperty('name', name);
  });

  test('should send audio session start', async () => {
    const write = jest
      .spyOn(WebSocketConnection.prototype, 'write')
      .mockImplementationOnce(writeMock);

    const packet = await service.sendAudioSessionStart();

    expect(open).toHaveBeenCalledTimes(0);
    expect(write).toHaveBeenCalledTimes(1);
    expect(packet.isControl()).toEqual(true);
  });

  test('should send audio session end', async () => {
    const write = jest
      .spyOn(WebSocketConnection.prototype, 'write')
      .mockImplementationOnce(writeMock);

    const packet = await service.sendAudioSessionEnd();

    expect(open).toHaveBeenCalledTimes(0);
    expect(write).toHaveBeenCalledTimes(1);
    expect(packet.isControl()).toEqual(true);
  });

  test('should send cancel responses', async () => {
    const write = jest
      .spyOn(WebSocketConnection.prototype, 'write')
      .mockImplementationOnce(writeMock);

    const packet = await service.sendCancelResponse({ utteranceId: [v4()] });

    expect(open).toHaveBeenCalledTimes(0);
    expect(write).toHaveBeenCalledTimes(1);
    expect(packet.isCancelResponse()).toEqual(true);
  });

  test('should send tts playback end', async () => {
    const write = jest
      .spyOn(WebSocketConnection.prototype, 'write')
      .mockImplementationOnce(writeMock);

    const packet = await service.sendTTSPlaybackStart();

    expect(open).toHaveBeenCalledTimes(0);
    expect(write).toHaveBeenCalledTimes(1);
    expect(packet.isControl()).toEqual(true);
    expect(packet.isTTSPlaybackStart()).toEqual(true);
  });

  test('should send tts playback start', async () => {
    const write = jest
      .spyOn(WebSocketConnection.prototype, 'write')
      .mockImplementationOnce(writeMock);

    const packet = await service.sendTTSPlaybackEnd();

    expect(open).toHaveBeenCalledTimes(0);
    expect(write).toHaveBeenCalledTimes(1);
    expect(packet.isControl()).toEqual(true);
    expect(packet.isTTSPlaybackEnd()).toEqual(true);
  });
});
