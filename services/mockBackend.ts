import { GameState, StudentResponse, NetworkMessage, LogEntry } from '../types';
import { Peer, DataConnection } from 'peerjs';
import { io, Socket } from 'socket.io-client';

const STORAGE_KEY = 'own_words_wiz_state';
const APP_PREFIX = 'oww-v1-';
// Fix: Cast import.meta to any to resolve TS error
const USE_WEBSOCKET = (import.meta as any).env?.VITE_USE_WEBSOCKET === 'true';

// Simplified STUN list.
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

// Initial state
const initialState: GameState = {
  prompt: '',
  maxScore: 2,
  isAcceptingAnswers: false,
  students: {},
  projectorDisplay: { type: 'prompt' },
};

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * GameService handles the game logic and networking.
 * It now supports two transport modes: P2P (PeerJS) and Server (Socket.io)
 */
class GameService {
  private state: GameState;
  private listeners: ((state: GameState) => void)[] = [];
  private logListeners: ((logs: LogEntry[]) => void)[] = [];
  
  // P2P (PeerJS) Variables
  private peer: Peer | null = null;
  private connections: DataConnection[] = [];
  
  // Server (Socket.io) Variables
  private socket: Socket | null = null;
  
  private isHost: boolean = false;
  public connectionStatus: ConnectionStatus = 'disconnected';
  private logs: LogEntry[] = [];
  private heartbeatInterval: any = null;

  constructor() {
    const saved = localStorage.getItem(STORAGE_KEY);
    this.state = saved ? JSON.parse(saved) : initialState;

    // Legacy tab sync
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        if (!this.isHost) {
           this.state = JSON.parse(e.newValue);
           this.notifyListeners();
        }
      }
    });
    
    this.addLog('info', `Service initialized (v1.0.2) [Mode: ${USE_WEBSOCKET ? 'Docker/Server' : 'Peer-to-Peer'}]`);
  }

  // --- Logging ---
  private addLog(type: 'info' | 'error' | 'success', message: string) {
    const entry: LogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      type,
      message
    };
    this.logs.unshift(entry);
    if (this.logs.length > 200) this.logs = this.logs.slice(0, 200);
    this.logListeners.forEach(l => l([...this.logs]));
    if (type === 'error') console.error(message);
    else console.log(`[${type.toUpperCase()}] ${message}`);
  }

  public getLogs(): LogEntry[] { return this.logs; }
  public subscribeLogs(callback: (logs: LogEntry[]) => void): () => void {
    this.logListeners.push(callback);
    callback([...this.logs]);
    return () => { this.logListeners = this.logListeners.filter(l => l !== callback); };
  }

  // --- State Management ---
  public getState(): GameState { return this.state; }
  public subscribe(callback: (state: GameState) => void): () => void {
    this.listeners.push(callback);
    callback(this.state);
    return () => { this.listeners = this.listeners.filter((l) => l !== callback); };
  }

  private persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    if (this.isHost) {
      this.broadcast({ type: 'SYNC_STATE', payload: this.state });
    }
    this.notifyListeners();
  }

  private notifyListeners() {
    const stateCopy = { ...this.state };
    this.listeners.forEach((l) => l(stateCopy));
  }

  // Unified Broadcast
  private broadcast(msg: NetworkMessage) {
    if (USE_WEBSOCKET) {
        // Socket.io Broadcast
        if (this.socket && this.state.roomCode) {
            this.socket.emit('message', { roomCode: this.state.roomCode, message: msg });
        }
    } else {
        // PeerJS Broadcast
        this.connections.forEach(conn => {
            if (conn.open) conn.send(msg);
        });
    }
  }

  // --- Networking: Start Host ---

  public async startNewClass(): Promise<string> {
    this.addLog('info', 'Starting new class...');
    this.stopHeartbeat();
    
    // Cleanup P2P
    if (this.peer) { this.peer.destroy(); this.peer = null; }
    this.connections = [];
    
    // Cleanup Socket
    if (this.socket) { this.socket.disconnect(); this.socket = null; }
    
    this.state = { ...initialState, roomCode: undefined };
    this.persist();

    return this.startHosting();
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    if (USE_WEBSOCKET) return; // WebSockets handle their own heartbeats
    
    this.heartbeatInterval = setInterval(() => {
        if (this.peer && this.peer.disconnected && !this.peer.destroyed) {
            this.addLog('info', 'Signaling lost. Reconnecting...');
            this.peer.reconnect();
        }
    }, 5000);
  }

  private stopHeartbeat() {
      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
  }

  public async startHosting(): Promise<string> {
    this.isHost = true;
    this.connectionStatus = 'connecting';
    this.addLog('info', 'Initializing Host...');
    
    const code = this.state.roomCode || Math.random().toString(36).substring(2, 6).toUpperCase();
    this.state = { ...this.state, roomCode: code };
    this.persist();

    if (USE_WEBSOCKET) {
        return this.startHostingSocket(code);
    } else {
        return this.startHostingP2P(code);
    }
  }

  // --------------------------------------------------------------------------
  // SOCKET.IO IMPLEMENTATION (Docker/NAS)
  // --------------------------------------------------------------------------

  private async startHostingSocket(code: string): Promise<string> {
      return new Promise((resolve) => {
          this.socket = io(); // Connects to relative path (server.js)
          
          this.socket.on('connect', () => {
              this.addLog('success', `Host Connected via Server. Room: ${code}`);
              this.connectionStatus = 'connected';
              this.socket?.emit('join_room', code);
              resolve(code);
          });

          this.socket.on('message', (data: any) => {
              // As host, we receive answers
              this.handleMessage(data);
          });

          this.socket.on('disconnect', () => {
              this.addLog('error', 'Disconnected from server');
              this.connectionStatus = 'error';
          });
      });
  }

  private async joinGameSocket(code: string, studentName: string): Promise<boolean> {
      return new Promise((resolve, reject) => {
          this.socket = io();
          
          this.socket.on('connect', () => {
              this.addLog('success', 'Connected to Server');
              this.socket?.emit('join_room', code);
              
              // Send join request
              this.socket?.emit('message', { 
                  roomCode: code, 
                  message: { type: 'JOIN_REQUEST', payload: { name: studentName } } 
              });
              
              // Wait a moment then resolve, as we don't get a direct ack from host in this simple version
              setTimeout(() => resolve(true), 500);
          });

          this.socket.on('message', (msg: NetworkMessage) => {
              if (msg.type === 'SYNC_STATE') {
                this.state = msg.payload;
                this.notifyListeners();
              }
              if (msg.type === 'RESET_FORM') {
                  this.notifyReset();
              }
          });
          
          this.socket.on('connect_error', () => {
             reject(new Error("Server connection failed"));
          });
      });
  }

  // --------------------------------------------------------------------------
  // PEERJS IMPLEMENTATION (Vercel/Static)
  // --------------------------------------------------------------------------

  private async startHostingP2P(code: string): Promise<string> {
    const fullId = APP_PREFIX + code;
    return new Promise((resolve) => {
      try {
        if (this.peer && !this.peer.destroyed) {
            this.addLog('info', 'Peer already active, reusing.');
            this.connectionStatus = 'connected';
            this.startHeartbeat();
            resolve(code);
            return;
        }

        this.peer = new Peer(fullId, {
            debug: 1,
            secure: true,
            config: { iceServers: ICE_SERVERS }
        });

        this.peer.on('open', (id) => {
          this.addLog('success', `Host Online. ID: ${id}`);
          this.connectionStatus = 'connected';
          this.startHeartbeat();
          resolve(code);
        });

        this.peer.on('connection', (conn) => {
          this.addLog('info', `Student connecting...`);
          conn.on('open', () => {
             this.addLog('success', `Student joined!`);
             this.connections.push(conn);
             setTimeout(() => {
                 conn.send({ type: 'SYNC_STATE', payload: this.state });
             }, 100);
          });
          conn.on('data', (data: any) => this.handleMessage(data));
          conn.on('close', () => {
             this.connections = this.connections.filter(c => c !== conn);
          });
        });

        this.peer.on('error', (err) => {
          this.addLog('error', `Host Peer Error: ${err.type}`);
          if (err.type === 'unavailable-id') {
             this.connectionStatus = 'connected';
             this.startHeartbeat();
          } else {
             this.connectionStatus = 'error';
          }
          resolve(code);
        });
        
        this.peer.on('disconnected', () => {
             if (this.peer && !this.peer.destroyed) this.peer.reconnect();
        });

      } catch (e: any) {
        this.addLog('error', `Exception: ${e.message}`);
        this.connectionStatus = 'error';
        resolve(code);
      }
    });
  }

  private async joinGameP2P(code: string, studentName: string): Promise<boolean> {
    const fullId = APP_PREFIX + code.toUpperCase();
    return new Promise((resolve, reject) => {
      try {
          if (this.peer) this.peer.destroy();
          const peer = new Peer({ secure: true, config: { iceServers: ICE_SERVERS } });
          
          peer.on('open', () => {
            this.addLog('info', `Connecting to Host...`);
            const conn = peer.connect(fullId, { serialization: 'json' });
            
            conn.on('open', () => {
              this.addLog('success', 'Connected to Teacher!');
              this.peer = peer;
              this.connections = [conn];
              conn.send({ type: 'JOIN_REQUEST', payload: { name: studentName } });
              resolve(true);
            });

            conn.on('data', (data: any) => {
              const msg = data as NetworkMessage;
              if (msg.type === 'SYNC_STATE') {
                this.state = msg.payload;
                this.notifyListeners();
              }
              if (msg.type === 'RESET_FORM') this.notifyReset();
            });

            setTimeout(() => {
              if (!conn.open) reject(new Error("Connection timed out."));
            }, 10000);
          });

          peer.on('error', (err) => {
             reject(err);
          });
      } catch (e: any) {
          reject(e);
      }
    });
  }

  // --- Common Logic ---

  public async joinGame(code: string, studentName: string): Promise<boolean> {
    this.isHost = false;
    this.addLog('info', `Joining room: ${code}`);

    if (USE_WEBSOCKET) {
        return this.joinGameSocket(code, studentName);
    } else {
        return this.joinGameP2P(code, studentName);
    }
  }

  private handleMessage(msg: NetworkMessage) {
    if (!this.isHost) return;
    if (msg.type === 'SUBMIT_ANSWER') {
      const { name, text } = msg.payload;
      this.addAnswerInternal(name, text);
    }
  }

  // Called by Student View
  public sendAnswer(studentName: string, text: string) {
    if (this.isHost) {
       this.addAnswerInternal(studentName, text);
    } else {
       if (USE_WEBSOCKET) {
           if (this.socket && this.state.roomCode) {
               this.socket.emit('message', { 
                   roomCode: this.state.roomCode, 
                   message: { type: 'SUBMIT_ANSWER', payload: { name: studentName, text } } 
               });
           }
       } else {
           if (this.connections[0]?.open) {
             this.connections[0].send({ type: 'SUBMIT_ANSWER', payload: { name: studentName, text } });
           }
       }
    }
  }
  
  private resetListeners: (() => void)[] = [];
  public subscribeReset(callback: () => void): () => void {
      this.resetListeners.push(callback);
      return () => { this.resetListeners = this.resetListeners.filter(l => l !== callback); };
  }
  private notifyReset() { this.resetListeners.forEach(l => l()); }

  private addAnswerInternal(studentName: string, text: string) {
    const id = studentName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();
    const response: StudentResponse = {
      id, studentName, text, submittedAt: Date.now(), score: null,
    };
    this.state = {
      ...this.state,
      students: { ...this.state.students, [id]: response }
    };
    this.persist();
  }

  // Teacher Actions
  public setPrompt(prompt: string, maxScore: number = 2) {
    this.state = { ...this.state, prompt, maxScore, isAcceptingAnswers: true, projectorDisplay: { type: 'prompt' } };
    this.persist();
  }

  public resetRound() {
      this.addLog('info', 'Resetting round.');
      this.state = { ...this.state, students: {}, isAcceptingAnswers: true, projectorDisplay: { type: 'prompt' } };
      this.persist();
      
      if (this.isHost) {
          this.broadcast({ type: 'RESET_FORM' } as any);
          if (!USE_WEBSOCKET) {
            // Repeat for UDP reliability if using P2P
            setTimeout(() => this.broadcast({ type: 'RESET_FORM' } as any), 500);
          }
      }
  }

  public setProjectorView(type: 'prompt' | 'answer', answerId?: string) {
    this.state = { ...this.state, projectorDisplay: { type, contentId: answerId } };
    this.persist();
  }

  public updateStudentScore(id: string, score: number) {
    if (this.state.students[id]) {
      this.state = { ...this.state, students: { ...this.state.students, [id]: { ...this.state.students[id], score } } };
      this.persist();
    }
  }

  public updateStudentAiData(id: string, score: number, feedback: string) {
    if (this.state.students[id]) {
       this.state = { ...this.state, students: { ...this.state.students, [id]: { ...this.state.students[id], aiSuggestedScore: score, aiFeedback: feedback } } };
      this.persist();
    }
  }
  
  public addDemoStudents() {
    ["Sarah J.", "Mike T.", "David L."].forEach((n) => this.addAnswerInternal(n, "Demo answer text."));
  }
}

export const backend = new GameService();