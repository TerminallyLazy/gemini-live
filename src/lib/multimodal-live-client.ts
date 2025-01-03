import { Content, GenerativeContentBlob, Part } from "@google/generative-ai";
import { EventEmitter } from "eventemitter3";
import { difference } from "lodash";
import {
  ClientContentMessage,
  isInterrupted,
  isModelTurn,
  isServerContenteMessage,
  isSetupCompleteMessage,
  isToolCallCancellationMessage,
  isToolCallMessage,
  isTurnComplete,
  LiveIncomingMessage,
  ModelTurn,
  RealtimeInputMessage,
  ServerContent,
  SetupMessage,
  StreamingLog,
  ToolCall,
  ToolCallCancellation,
  ToolResponseMessage,
  type LiveConfig,
} from "../multimodal-live-types";
import { blobToJSON, base64ToArrayBuffer } from "./utils";

/**
 * the events that this client will emit
 */
interface MultimodalLiveClientEventTypes {
  open: () => void;
  log: (log: StreamingLog) => void;
  close: (event: CloseEvent) => void;
  audio: (data: ArrayBuffer) => void;
  content: (data: ServerContent) => void;
  interrupted: () => void;
  setupcomplete: () => void;
  turncomplete: () => void;
  toolcall: (toolCall: ToolCall) => void;
  toolcallcancellation: (toolcallCancellation: ToolCallCancellation) => void;
  error: (error: Error) => void;
  message: (data: any) => void;
}

export type MultimodalLiveAPIClientConnection = {
  url?: string;
  apiKey: string;
};

/**
 * A event-emitting class that manages the connection to the websocket and emits
 * events to the rest of the application.
 * If you dont want to use react you can still use this.
 */
export class MultimodalLiveClient extends EventEmitter<MultimodalLiveClientEventTypes> {
  public ws: WebSocket | null = null;
  protected config: LiveConfig | null = null;
  public url: string = "";
  private setupPromiseResolve: (() => void) | null = null;
  private setupPromiseReject: ((error: Error) => void) | null = null;

  private connectionAttempts = 0;
  private maxRetries = 3;
  private retryDelay = 1000;
  private isConnecting = false;
  setupTimeout: any;

  constructor({ url, apiKey }: MultimodalLiveAPIClientConnection) {
    super();
    const host = 'generativelanguage.googleapis.com';
    url =
      url ||
      `wss://${host}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent`;
    url += `?key=${apiKey}`;
    this.url = url;
    this.send = this.send.bind(this);
  }

  /**
   * Logs events with an optional data payload.
   * @param type The type of the event.
   * @param message The message to log.
   * @param data Optional data associated with the event.
   */
  log(type: string, message: StreamingLog["message"], data?: any) {
    const log: StreamingLog = {
      date: new Date(),
      type,
      message: typeof message === 'string' ? message : JSON.stringify(message)
    };

    // Only add data if it exists and message is an object
    if (data !== undefined) {
      try {
        const messageObj = typeof message === 'string' ? { text: message } : message;
        log.message = JSON.stringify({
          ...messageObj,
          data
        });
      } catch (error) {
        console.error('Error stringifying log data:', error);
        // Fallback to just the message if data can't be stringified
        log.message = typeof message === 'string' ? message : JSON.stringify(message);
      }
    }

    this.emit("log", log);
  }

  async connect(config: LiveConfig): Promise<boolean> {
    if (this.isConnecting) {
      this.log('client.warn', 'Connection attempt already in progress');
      return false;
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.log('client.warn', 'WebSocket is already connected');
      return true;
    }

    this.isConnecting = true;
    this.config = config;

    return new Promise((resolve, reject) => {
      const tryConnect = () => {
        if (this.connectionAttempts >= this.maxRetries) {
          this.isConnecting = false;
          const error = new Error(`Failed to connect after ${this.maxRetries} attempts`);
          this.log('client.error', error.message);
          reject(error);
          return;
        }

        this.connectionAttempts++;
        this.log('client.info', `Connection attempt ${this.connectionAttempts} of ${this.maxRetries}`);
        
        const ws = new WebSocket(this.url);
        this.ws = ws;

        const cleanup = () => {
          ws.removeEventListener('error', onError);
          ws.removeEventListener('open', onOpen);
          ws.removeEventListener('close', onClose);
        };

        const onError = (ev: Event) => {
          this.log('client.error', `WebSocket error: ${(ev as ErrorEvent).message || 'Unknown error'}`);
          cleanup();
          this.disconnect(ws);
          
          if (this.connectionAttempts < this.maxRetries) {
            const delay = this.retryDelay * Math.pow(2, this.connectionAttempts - 1);
            this.log('client.retry', `Retrying connection in ${delay}ms (attempt ${this.connectionAttempts})`);
            setTimeout(tryConnect, delay);
          } else {
            this.isConnecting = false;
            reject(new Error('Max retries reached'));
          }
        };

        const onClose = (ev: CloseEvent) => {
          this.log('client.close', `WebSocket closed with code ${ev.code}: ${ev.reason || 'No reason provided'}`);
          cleanup();
          this.emit('close', ev);
          
          if (!this.isConnecting) {
            return;
          }
          
          if (this.connectionAttempts < this.maxRetries) {
            const delay = this.retryDelay * Math.pow(2, this.connectionAttempts - 1);
            setTimeout(tryConnect, delay);
          } else {
            this.isConnecting = false;
            reject(new Error('Max retries reached'));
          }
        };

        const onOpen = async () => {
          this.log('client.open', 'WebSocket connection established');
          this.emit('open');
          
          try {
            const setupMessage: SetupMessage = {
              setup: this.config as LiveConfig,
            };
            
            const setupTimeout = setTimeout(() => {
              this.log('client.error', 'Setup confirmation timeout');
              ws.close();
              this.isConnecting = false;
              reject(new Error('Setup confirmation timeout'));
            }, 10000);

            const setupHandler = (event: MessageEvent) => {
              try {
                const data = JSON.parse(event.data);
                if (isSetupCompleteMessage(data)) {
                  this.log('client.setup', 'Received setup complete');
                  clearTimeout(setupTimeout);
                  ws.removeEventListener('message', setupHandler);
                  this.isConnecting = false;
                  this.connectionAttempts = 0;
                  resolve(true);
                }
              } catch (error) {
                this.log('client.error', `Failed to parse setup response: ${error}`);
              }
            };

            ws.addEventListener('message', setupHandler);
            
            this.log('client.setup', 'Sending setup message', setupMessage);
            this._sendDirect(setupMessage);

          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.log('client.error', `Setup failed: ${errorMessage}`);
            cleanup();
            ws.close();
            this.isConnecting = false;
            reject(error);
          }
        };

        ws.addEventListener('error', onError);
        ws.addEventListener('open', onOpen);
        ws.addEventListener('close', onClose);
        ws.addEventListener('message', (event) => {
          this.log('server.message', `Received: ${event.data}`);
          try {
            const blob = new Blob([event.data]);
            this.receive(blob);
          } catch (error) {
            this.log('client.error', `Failed to process message: ${error}`);
          }
        });
      };

      tryConnect();
    });
  }

  disconnect(ws?: WebSocket) {
    // could be that this is an old websocket and theres already a new instance
    // only close it if its still the correct reference
    if ((!ws || this.ws === ws) && this.ws) {
      this.isConnecting = false;
      this.connectionAttempts = 0;
      this.ws.close();
      this.ws = null;
      this.log("client.close", `Disconnected`);
      return true;
    }
    return false;
  }

  private handleClose = (ev: CloseEvent) => {
    this.disconnect(undefined); // Pass undefined instead of this.ws to match the parameter type
    const reason = ev.reason || "";
    this.log(
      `server.${ev.type}`,
      `disconnected ${reason ? `with reason: ${reason}` : ``}`,
    );
    this.emit("close", ev);
  };

  protected async receive(blob: Blob) {
    const response: LiveIncomingMessage = (await blobToJSON(
      blob,
    )) as LiveIncomingMessage;
    if (isToolCallMessage(response)) {
      this.log("server.toolCall", response);
      this.emit("toolcall", response.toolCall);
      return;
    }
    if (isToolCallCancellationMessage(response)) {
      this.log("receive.toolCallCancellation", response);
      this.emit("toolcallcancellation", response.toolCallCancellation);
      return;
    }

    if (isSetupCompleteMessage(response)) {
      this.log("server.send", "setupComplete");
      this.emit("setupcomplete");
      return;
    }

    // this json also might be `contentUpdate { interrupted: true }`
    // or contentUpdate { end_of_turn: true }
    if (isServerContenteMessage(response)) {
      const { serverContent } = response;
      if (isInterrupted(serverContent)) {
        this.log("receive.serverContent", "interrupted");
        this.emit("interrupted");
        return;
      }
      if (isTurnComplete(serverContent)) {
        this.log("server.send", "turnComplete");
        this.emit("turncomplete");
        //plausible theres more to the message, continue
      }

      if (isModelTurn(serverContent)) {
        let parts: Part[] = serverContent.modelTurn.parts;

        // when its audio that is returned for modelTurn
        const audioParts = parts.filter(
          (p) => p.inlineData && p.inlineData.mimeType.startsWith("audio/pcm"),
        );
        const base64s = audioParts.map((p) => p.inlineData?.data);

        // strip the audio parts out of the modelTurn
        const otherParts = difference(parts, audioParts);
        // console.log("otherParts", otherParts);

        base64s.forEach((b64) => {
          if (b64) {
            const data = base64ToArrayBuffer(b64);
            this.emit("audio", data);
            this.log(`server.audio`, `buffer (${data.byteLength})`);
          }
        });
        if (!otherParts.length) {
          return;
        }

        parts = otherParts;

        const content: ModelTurn = { modelTurn: { parts } };
        this.emit("content", content);
        this.log(`server.content`, response);
      }
    } else {
      console.log("received unmatched message", response);
    }
  }

  /**
   * send realtimeInput, this is base64 chunks of "audio/pcm" and/or "image/jpg"
   */
  sendRealtimeInput(chunks: GenerativeContentBlob[]) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket connection is not available');
    }

    try {
      let hasAudio = false;
      let hasVideo = false;
      for (const chunk of chunks) {
        if (!chunk || !chunk.mimeType) {
          throw new Error('Invalid chunk format: missing mimeType');
        }
        
        if (chunk.mimeType.includes("audio")) {
          hasAudio = true;
          // Validate audio data
          if (!chunk.data || typeof chunk.data !== 'string') {
            throw new Error('Invalid audio data format');
          }
        }
        if (chunk.mimeType.includes("image")) {
          hasVideo = true;
        }
        if (hasAudio && hasVideo) {
          break;
        }
      }

      const message = hasAudio && hasVideo
        ? "audio + video"
        : hasAudio
          ? "audio"
          : hasVideo
            ? "video"
            : "unknown";

      const data: RealtimeInputMessage = {
        realtimeInput: {
          mediaChunks: chunks,
        },
      };

      this._sendDirect(data);
      this.log(`client.realtimeInput`, message, data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error sending audio data';
      this.emit('error', new Error(errorMessage));
      this.log('client.error', errorMessage);
      throw error;
    }
  }

  /**
   *  send a response to a function call and provide the id of the functions you are responding to
   */
  sendToolResponse(toolResponse: ToolResponseMessage["toolResponse"]) {
    const message: ToolResponseMessage = {
      toolResponse,
    };

    this._sendDirect(message);
    this.log(`client.toolResponse`, message);
  }

  /**
   * send normal content parts such as { text }
   */
  send(parts: Part | Part[], turnComplete: boolean = true) {
    parts = Array.isArray(parts) ? parts : [parts];
    const content: Content = {
      role: "user",
      parts,
    };

    const clientContentRequest: ClientContentMessage = {
      clientContent: {
        turns: [content],
        turnComplete,
      },
    };

    this._sendDirect(clientContentRequest);
    this.log(`client.send`, clientContentRequest);
  }

  /**
   *  used internally to send all messages
   *  don't use directly unless trying to send an unsupported message type
   */
  _sendDirect(message: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    
    const messageStr = JSON.stringify(message);
    this.log('client.send', 'Sending message', message);
    
    try {
      this.ws.send(messageStr);
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.log('client.error', `Failed to send message: ${error.message}`);
      } else {
        this.log('client.error', 'Failed to send message: Unknown error');
      }
      throw error;
    }
  }

  private handleMessage(event: MessageEvent) {
    try {
      if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
        // Handle binary data (audio)
        if (event.data instanceof Blob) {
          event.data.arrayBuffer().then(buffer => {
            this.emit('audio', buffer);
          }).catch(error => {
            this.emit('error', new Error('Failed to process audio data'));
          });
        } else {
          this.emit('audio', event.data);
        }
        return;
      }

      // Handle text/JSON messages
      let data: any;
      if (typeof event.data === 'string') {
        try {
          data = JSON.parse(event.data);
        } catch (error) {
          // If not valid JSON, treat as raw string message
          data = { type: 'raw', content: event.data };
        }
      } else {
        throw new Error('Unsupported message format');
      }

      // Process the message based on type
      if (data.type === 'ready' || data.type === 'config_ack') {
        this.setupPromiseResolve?.();
        this.emit('open');
      } else if (data.error) {
        this.emit('error', new Error(data.error.message || 'Server error'));
      } else {
        this.emit('message', data);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error processing message';
      this.emit('error', new Error(errorMessage));
      console.error('Error handling message:', error);
    }
  }

  private setupHandler(event: MessageEvent) {
    try {
      // Log the raw message for debugging
      console.log('Raw setup response:', event.data);
      
      // Try to parse as JSON, but first check if it's a string
      let response;
      if (typeof event.data === 'string') {
        // Remove any BOM or whitespace
        const cleanData = event.data.trim().replace(/^\uFEFF/, '');
        try {
          response = JSON.parse(cleanData);
        } catch (e) {
          throw new Error(`Failed to parse setup response: ${e}\nRaw data: ${cleanData}`);
        }
      } else {
        response = event.data;
      }

      // Log parsed response
      console.log('Parsed setup response:', response);

      if (response?.type === 'setup_complete') {
        // Clear timeout and resolve setup promise
        if (this.setupTimeout) {
          clearTimeout(this.setupTimeout);
          this.setupTimeout = null;
        }
        this.setupPromiseResolve?.();
      } else {
        throw new Error(`Invalid setup response: ${JSON.stringify(response)}`);
      }
    } catch (error) {
      console.error('Setup handler error:', error);
      this.setupPromiseReject?.(error as Error);
    }
  }

  private sendInitialConfig() {
    try {
      const initialMessage = {
        type: 'setup',
        config: this.config
      };

      // Log what we're sending
      console.log('Sending initial config:', JSON.stringify(initialMessage, null, 2));
      
      if (this.ws) {
        this.ws.send(JSON.stringify(initialMessage));
      } else {
        throw new Error('WebSocket connection not initialized');
      }
    } catch (error) {
      console.error('Error sending initial config:', error);
      this.setupPromiseReject?.(error as Error);
    }
  }
}
